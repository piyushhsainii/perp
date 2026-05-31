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

const TICK_MS = 900;
const VOLATILITY = 0.0009;
const STARTING_BALANCE = 500;

// Per-market base prices for seeding sim when backend not connected
const MARKET_BASE_PRICES: Record<string, number> = {
  "BTC-PERP": 65_000,
  "ETH-PERP": 3_200,
  "SOL-PERP": 180,
  "BNB-PERP": 580,
  "ARB-PERP": 1,
  "DOGE-PERP": 0,
};

function getBasePrice(marketId: string): number {
  return MARKET_BASE_PRICES[marketId] ?? 100;
}

function seedHistory(basePrice: number): {
  price: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}[] {
  const now = Date.now();
  let p = Math.max(1, basePrice);
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
}

function initialState(basePrice = 65_000): DemoState {
  return {
    balance: STARTING_BALANCE,
    position: null,
    trades: [],
    markPrice: basePrice,
    indexPrice: Math.max(1, basePrice - Math.round(basePrice * 0.001)),
  };
}

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
  const basePrice = getBasePrice(marketId);

  useEffect(() => {
    userIdRef.current = getOrCreateUserId();
  }, []);

  const [demo, setDemo] = useState<DemoState>(() => initialState(basePrice));
  // markPriceRef drives all intervals — always up to date regardless of state cycle
  const markPriceRef = useRef(basePrice);
  const trendRef = useRef(0);

  const [orderbook, setOrderbook] = useState(() =>
    buildSyntheticOrderbook(basePrice),
  );
  const [priceHistory, setPriceHistory] = useState(() =>
    seedHistory(basePrice),
  );

  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderFlash, setLastOrderFlash] = useState<"buy" | "sell" | null>(
    null,
  );
  const [liquidated, setLiquidated] = useState(false);
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

  // ── When market changes, re-seed everything with correct base price ────────
  // Use a ref to track previous marketId so we only reset on actual change
  const prevMarketRef = useRef(marketId);
  useEffect(() => {
    if (prevMarketRef.current === marketId) return;
    prevMarketRef.current = marketId;

    const bp = getBasePrice(marketId);
    markPriceRef.current = bp;
    trendRef.current = 0;
    setDemo(initialState(bp));
    setOrderbook(buildSyntheticOrderbook(bp));
    setPriceHistory(seedHistory(bp));
    setOrderError(null);
    setLiquidated(false);
  }, [marketId]);

  // ── Sync live prices from WS — only when meaningfully different ──────────
  // Guard: only update if the incoming price is >0 and actually different
  const lastSyncedMarkRef = useRef<number>(0);
  useEffect(() => {
    if (!connected) return;
    if (!liveMarkPrice || liveMarkPrice <= 0) return;
    if (Math.abs(liveMarkPrice - lastSyncedMarkRef.current) < 0.01) return;

    lastSyncedMarkRef.current = liveMarkPrice;
    markPriceRef.current = liveMarkPrice;

    setDemo((prev) => ({
      ...prev,
      markPrice: liveMarkPrice,
      indexPrice: liveIndexPrice ?? prev.indexPrice,
    }));
  }, [connected, liveMarkPrice, liveIndexPrice]);

  // ── Sim price tick — only when NOT connected ──────────────────────────────
  useEffect(() => {
    if (connected) return;

    const bp = getBasePrice(marketId);
    // If markPriceRef drifted to wrong market base during switch, re-anchor it
    if (Math.abs(markPriceRef.current - bp) > bp * 0.5) {
      markPriceRef.current = bp;
    }

    const priceId = setInterval(() => {
      setDemo((prev) => {
        const mark = nextMarkPrice(
          prev.markPrice,
          VOLATILITY,
          trendRef.current * 0.00003,
        );
        const index = nextIndexPrice(mark, prev.indexPrice);
        // Mean reversion toward current market base (not hardcoded 65000)
        trendRef.current = ((bp - mark) / bp) * 10;
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
  }, [connected, marketId]);

  // ── Price history — always runs, reads from ref ───────────────────────────
  useEffect(() => {
    const histId = setInterval(() => {
      const p = markPriceRef.current;
      if (p <= 0) return; // guard: never append zero-price candles

      setPriceHistory((ph) => {
        const prev = ph[ph.length - 1];
        const open = prev?.close ?? Math.round(p);
        const close = Math.round(p);
        // Only append if price has actually changed from last candle (prevents flat chart)
        if (close === open && ph.length > 1) {
          // Still append, but add tiny noise so chart has movement
          const noise = Math.round((Math.random() - 0.5) * p * 0.0002);
          const noisy = Math.max(1, close + noise);
          return [
            ...ph,
            {
              price: noisy,
              time: Date.now(),
              open,
              close: noisy,
              high: Math.max(open, noisy) + 1,
              low: Math.max(1, Math.min(open, noisy) - 1),
            },
          ].slice(-120);
        }
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
            low: Math.max(
              1,
              Math.round(Math.min(open, close) - Math.random() * p * 0.0003),
            ),
          },
        ].slice(-120);
      });
    }, TICK_MS + 160);
    return () => clearInterval(histId);
  }, []); // deliberately empty — reads markPriceRef directly

  // ── Poll backend position when connected ──────────────────────────────────
  // FIX: use exponential backoff after 404s to stop spam
  const position404Count = useRef(0);
  useEffect(() => {
    if (!connected) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const uid = userIdRef.current;
      if (!uid) {
        timeoutId = setTimeout(poll, 2_000);
        return;
      }

      try {
        const pos = await api.getPosition(uid, marketId);
        position404Count.current = 0; // reset on success
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
        timeoutId = setTimeout(poll, 2_000);
      } catch {
        // 404 = no open position — clear it, but back off polling
        position404Count.current += 1;
        setDemo((prev) =>
          prev.position === null ? prev : { ...prev, position: null },
        );

        // Back off: 2s → 4s → 8s → cap at 10s
        const delay = Math.min(
          10_000,
          2_000 * Math.pow(2, Math.min(position404Count.current - 1, 3)),
        );
        timeoutId = setTimeout(poll, delay);
      }
    };

    timeoutId = setTimeout(poll, 500); // small initial delay
    return () => clearTimeout(timeoutId);
  }, [connected, marketId]);

  // ── Place order ───────────────────────────────────────────────────────────
  const placeOrder = useCallback(
    async (params: OrderParams) => {
      setOrderError(null);

      // ALWAYS enforce integer qty — Rust u32 rejects floats
      const safeQty = Math.max(1, Math.floor(params.qty));
      const safePrice =
        params.price !== undefined ? Math.round(params.price) : undefined;

      if (connected) {
        const mark = markPriceRef.current;
        const margin = ((safePrice ?? mark) * safeQty) / params.leverage;

        if (margin > demo.balance) {
          const err = `Insufficient balance. Need $${margin.toFixed(2)}, have $${demo.balance.toFixed(2)}`;
          setOrderError(err);
          showToast(`✗ ${err}`, "error");
          return;
        }

        showToast("Sending order to engine…", "pending");

        try {
          console.log("[order] sending to Rust:", {
            marketId,
            side: params.side,
            qty: safeQty,
            price: safePrice,
            margin,
          });
          const resp = await api.placeOrder({
            user_id: userIdRef.current,
            side: params.side,
            qty: safeQty,
            price: safePrice,
            margin,
            market: marketId,
          });
          console.log("[order] Rust response:", resp);

          // Reset 404 backoff after a successful order (position will appear soon)
          position404Count.current = 0;

          showToast(
            `✓ ${params.side === "Buy" ? "Long" : "Short"} ${safeQty} @ ${marketId} — queued`,
            "success",
          );

          setDemo((prev) => ({
            ...prev,
            balance: Math.max(0, prev.balance - margin),
            trades: [
              {
                id: resp.event_id,
                side: params.side,
                price: resp.fill_price ?? Math.round(mark),
                qty: safeQty,
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
        setDemo((prev) => {
          // Clone params with safe integers for local sim too
          const safeParams = { ...params, qty: safeQty, price: safePrice };
          const result = executeOrder(prev, safeParams, prev.markPrice);
          if (!result.ok) {
            setOrderError(result.error ?? "Order failed");
            showToast(`✗ ${result.error}`, "error");
            return prev;
          }
          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);
          showToast(
            `✓ ${params.side === "Buy" ? "Long" : "Short"} ${safeQty} @ $${Math.round(prev.markPrice).toLocaleString()}`,
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
    await placeOrder({
      side: closeSide,
      qty: demo.position.size,
      leverage: demo.position.leverage,
    });
  }, [demo.position, placeOrder]);

  // ── Reset (balance only — keep market price intact) ───────────────────────
  const resetDemo = useCallback(() => {
    // DON'T reset markPriceRef — keep whatever price we have so chart doesn't jump
    const currentMark = markPriceRef.current;
    setDemo({ ...initialState(currentMark), markPrice: currentMark });
    setOrderError(null);
    setLiquidated(false);
    // Reseed history from current price so chart stays coherent
    setPriceHistory(seedHistory(currentMark));
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
