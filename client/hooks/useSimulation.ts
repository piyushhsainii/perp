"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  nextMarkPrice,
  nextIndexPrice,
  buildSyntheticOrderbook,
  executeOrder,
  unrealisedPnl,
  marginRatio,
  liquidationPrice,
  type DemoState,
  type OrderParams,
  type SimTrade,
} from "../lib/simulation";
import * as api from "../lib/api";

const INITIAL_PRICE = 65_000;
const TICK_MS = 900;
const VOLATILITY = 0.0009;
const STARTING_BALANCE = 500;

function initialState(basePrice = INITIAL_PRICE): DemoState {
  return {
    balance: STARTING_BALANCE,
    position: null,
    trades: [],
    markPrice: basePrice,
    indexPrice: basePrice - Math.round(basePrice * 0.001),
  };
}

// Stable per-session user ID
function getOrCreateUserId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = sessionStorage.getItem("perp_user_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("perp_user_id", id);
  }
  return id;
}

export function useSimulation(
  marketId: string,
  connected: boolean,
  liveMarkPrice?: number,
  liveIndexPrice?: number,
) {
  const userIdRef = useRef<string>("");
  useEffect(() => {
    userIdRef.current = getOrCreateUserId();
  }, []);

  const [demo, setDemo] = useState<DemoState>(() => initialState());
  const markPriceRef = useRef(INITIAL_PRICE);
  const trendRef = useRef(0);

  const [orderbook, setOrderbook] = useState(() =>
    buildSyntheticOrderbook(INITIAL_PRICE),
  );
  const [priceHistory, setPriceHistory] = useState<
    {
      price: number;
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }[]
  >(() => {
    const now = Date.now();
    let p = INITIAL_PRICE;
    return Array.from({ length: 80 }, (_, i) => {
      const open = Math.round(p);
      p = Math.max(1, p + (Math.random() - 0.498) * p * VOLATILITY * 5);
      const close = Math.round(p);
      return {
        price: close,
        time: now - (80 - i) * TICK_MS,
        open,
        close,
        high: Math.round(Math.max(open, close) + Math.random() * p * 0.0004),
        low: Math.round(Math.min(open, close) - Math.random() * p * 0.0004),
      };
    });
  });

  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderFlash, setLastOrderFlash] = useState<"buy" | "sell" | null>(
    null,
  );
  const [liquidated, setLiquidated] = useState(false);

  // ── Toast/confirmation for real order sends ───────────────────────────────
  const [orderToast, setOrderToast] = useState<{
    msg: string;
    type: "success" | "error" | "pending";
  } | null>(null);

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "pending") => {
      setOrderToast({ msg, type });
      setTimeout(() => setOrderToast(null), 3500);
    },
    [],
  );

  // ── Sync live prices from WS ──────────────────────────────────────────────
  // Use a ref to avoid re-triggering the sim intervals
  const liveMarkRef = useRef<number | undefined>(liveMarkPrice);
  const liveIndexRef = useRef<number | undefined>(liveIndexPrice);
  liveMarkRef.current = liveMarkPrice;
  liveIndexRef.current = liveIndexPrice;

  useEffect(() => {
    if (!connected || liveMarkPrice === undefined) return;
    markPriceRef.current = liveMarkPrice;
    setDemo((prev) => ({
      ...prev,
      markPrice: liveMarkPrice,
      indexPrice: liveIndexPrice ?? prev.indexPrice,
    }));
  }, [connected, liveMarkPrice, liveIndexPrice]);

  // ── Sim price tick — only when disconnected ───────────────────────────────
  useEffect(() => {
    if (connected) return;

    const priceId = setInterval(() => {
      setDemo((prev) => {
        const mark = nextMarkPrice(
          prev.markPrice,
          VOLATILITY,
          trendRef.current * 0.00003,
        );
        const index = nextIndexPrice(mark, prev.indexPrice);
        trendRef.current = ((INITIAL_PRICE - mark) / INITIAL_PRICE) * 10;
        markPriceRef.current = mark;
        if (prev.position && marginRatio(prev.position, mark) <= 0.05) {
          setLiquidated(true);
          setTimeout(() => setLiquidated(false), 4000);
          return {
            ...prev,
            position: null,
            markPrice: mark,
            indexPrice: index,
            trades: [
              {
                id: crypto.randomUUID(),
                side: prev.position.side === "Long" ? "Sell" : "Buy",
                price: mark,
                qty: prev.position.size,
                timestamp: Date.now(),
                pnl: -prev.position.margin,
              } as SimTrade,
              ...prev.trades,
            ].slice(0, 100),
          };
        }
        return { ...prev, markPrice: mark, indexPrice: index };
      });
    }, TICK_MS);

    const obId = setInterval(() => {
      setOrderbook(buildSyntheticOrderbook(markPriceRef.current));
    }, TICK_MS + 80);

    return () => {
      clearInterval(priceId);
      clearInterval(obId);
    };
  }, [connected]);

  // ── Price history — runs always (sim or live) ─────────────────────────────
  useEffect(() => {
    const histId = setInterval(() => {
      const p = markPriceRef.current;
      setPriceHistory((ph) => {
        const prev = ph[ph.length - 1];
        const open = prev?.close ?? p;
        const close = Math.round(p);
        return [
          ...ph,
          {
            price: close,
            time: Date.now(),
            open,
            close,
            high: Math.round(
              Math.max(open, close) + Math.random() * p * 0.0003,
            ),
            low: Math.round(Math.min(open, close) - Math.random() * p * 0.0003),
          },
        ].slice(-120);
      });
    }, TICK_MS + 160);
    return () => clearInterval(histId);
  }, []); // runs once, reads from ref

  // ── Poll backend position when connected ──────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        const pos = await api.getPosition(uid, marketId);
        setDemo((prev) => ({
          ...prev,
          position: {
            side: pos.side as "Long" | "Short",
            size: pos.size,
            entryPrice: pos.entry_price,
            margin: pos.margin,
            leverage: Math.max(1, Math.round(pos.leverage)),
          },
        }));
      } catch {
        // 404 = no position — clear local position so panel shows "no open position"
        setDemo((prev) => ({ ...prev, position: null }));
      }
    }, 2_000);
    return () => clearInterval(id);
  }, [connected, marketId]);

  // ── Place order ───────────────────────────────────────────────────────────
  const placeOrder = useCallback(
    async (params: OrderParams) => {
      setOrderError(null);

      if (connected) {
        // LIVE PATH — send to Rust backend
        const mark = markPriceRef.current;
        const margin = ((params.price ?? mark) * params.qty) / params.leverage;

        if (margin > demo.balance) {
          const err = `Insufficient balance. Need $${margin.toFixed(2)}, have $${demo.balance.toFixed(2)}`;
          setOrderError(err);
          showToast(err, "error");
          return;
        }

        showToast("Sending order to engine…", "pending");

        try {
          console.log("[order] sending to Rust:", {
            marketId,
            side: params.side,
            qty: params.qty,
            margin,
          });
          const resp = await api.placeOrder({
            user_id: userIdRef.current,
            side: params.side,
            qty: params.qty,
            price: params.price,
            margin,
            market: marketId,
          });
          console.log("[order] Rust response:", resp);

          showToast(
            `✓ Order queued on ${marketId} — ID: ${resp.event_id.slice(0, 8)}…`,
            "success",
          );

          // Optimistic deduction so the form feels instant
          setDemo((prev) => ({
            ...prev,
            balance: Math.max(0, prev.balance - margin),
            trades: [
              {
                id: resp.event_id,
                side: params.side,
                price: resp.fill_price ?? mark,
                qty: params.qty,
                timestamp: Date.now(),
              } as SimTrade,
              ...prev.trades,
            ].slice(0, 100),
          }));

          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Order failed";
          console.error("[order] failed:", msg);
          setOrderError(msg);
          showToast(`✗ ${msg}`, "error");
        }
      } else {
        // SIM PATH — local execution
        setDemo((prev) => {
          const result = executeOrder(prev, params, prev.markPrice);
          if (!result.ok) {
            setOrderError(result.error ?? "Order failed");
            showToast(`✗ ${result.error}`, "error");
            return prev;
          }
          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);
          showToast(
            `✓ ${params.side === "Buy" ? "Long" : "Short"} ${params.qty} contracts filled at $${Math.round(prev.markPrice).toLocaleString()}`,
            "success",
          );
          return { ...prev, ...result.newState };
        });
      }
    },
    [connected, demo.balance, marketId, showToast],
  );

  // ── Close position ────────────────────────────────────────────────────────
  const closePosition = useCallback(async () => {
    if (!demo.position) return;
    const closeSide: "Buy" | "Sell" =
      demo.position.side === "Long" ? "Sell" : "Buy";
    if (connected) {
      await placeOrder({
        side: closeSide,
        qty: demo.position.size,
        leverage: demo.position.leverage,
      });
    } else {
      setDemo((prev) => {
        if (!prev.position) return prev;
        const result = executeOrder(
          prev,
          {
            side: closeSide,
            qty: prev.position.size,
            leverage: prev.position.leverage,
          },
          prev.markPrice,
        );
        if (!result.ok) return prev;
        setLastOrderFlash(closeSide === "Buy" ? "buy" : "sell");
        setTimeout(() => setLastOrderFlash(null), 800);
        return { ...prev, ...result.newState };
      });
    }
  }, [connected, demo.position, placeOrder]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetDemo = useCallback(() => {
    setDemo(initialState());
    markPriceRef.current = INITIAL_PRICE;
    setOrderError(null);
    setLiquidated(false);
  }, []);

  const positionStats = demo.position
    ? {
        upnl: unrealisedPnl(demo.position, demo.markPrice),
        mr: marginRatio(demo.position, demo.markPrice),
        liqPrice: liquidationPrice(demo.position),
      }
    : null;

  const fundingRate =
    (demo.markPrice - demo.indexPrice) / Math.max(demo.indexPrice, 1);

  return {
    demo,
    orderbook,
    priceHistory,
    positionStats,
    fundingRate,
    orderError,
    lastOrderFlash,
    liquidated,
    orderToast,
    placeOrder,
    closePosition,
    resetDemo,
    userId: userIdRef.current,
  };
}
