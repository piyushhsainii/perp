"use client";

/**
 * useSimulation.ts
 *
 * When backend is CONNECTED:
 *   - Orders   → POST /order  (Rust engine)
 *   - Position → GET  /position/:userId  (polled every 2 s)
 *   - Funding  → GET  /funding-rate      (polled every 30 s)
 *   - Mark price → WS midpoint (passed in via liveMarkPrice)
 *   - Price history → ticks from real WS price
 *
 * When DISCONNECTED:
 *   - Everything runs from the existing random-walk simulation.
 *
 * The hook's return shape is identical in both modes so TradingView
 * doesn't need to branch.
 */

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
} from "../lib/simulation";
import * as api from "../lib/api";
import type { Position as BackendPosition } from "../lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const TICK_MS = 900;
const VOLATILITY = 0.0009;
const STARTING_BALANCE = 10_000;
const POSITION_POLL_MS = 2_000;
const FUNDING_POLL_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderToast {
  msg: string;
  type: "success" | "error" | "pending";
}

// ─── User identity ────────────────────────────────────────────────────────────

function getUserId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const stored = localStorage.getItem("perp_user_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("perp_user_id", id);
  return id;
}

// ─── Map backend position → sim position ─────────────────────────────────────

function backendToSimPosition(p: BackendPosition) {
  return {
    side: p.side,
    size: p.size,
    entryPrice: p.entry_price,
    margin: p.margin,
    leverage: p.leverage,
  };
}

// ─── Initial state ────────────────────────────────────────────────────────────

// Each market has its own base price so the sim starts at a realistic level.
const BASE_PRICES: Record<string, number> = {
  "BTC-PERP":  65_000,
  "ETH-PERP":   3_200,
  "SOL-PERP":     180,
  "BNB-PERP":     580,
  "ARB-PERP":       1,
  "DOGE-PERP":   0.18,
};

function getBasePrice(marketId: string): number {
  return BASE_PRICES[marketId] ?? 65_000;
}

function initialState(marketId: string): DemoState {
  const p = getBasePrice(marketId);
  return {
    balance: STARTING_BALANCE,
    position: null,
    trades: [],
    markPrice: p,
    indexPrice: p * 0.9992, // tiny discount
  };
}

function initialHistory(now: number, basePrice: number) {
  let p = basePrice;
  return Array.from({ length: 80 }, (_, i) => {
    const open = Math.round(p * 100) / 100;
    p = Math.max(basePrice * 0.5, p + (Math.random() - 0.498) * p * VOLATILITY * 5);
    const close = Math.round(p * 100) / 100;
    const hi = Math.round((Math.max(open, close) + Math.random() * p * 0.0004) * 100) / 100;
    const lo = Math.round((Math.min(open, close) - Math.random() * p * 0.0004) * 100) / 100;
    return {
      price: close,
      time: now - (80 - i) * TICK_MS,
      open,
      high: hi,
      low: lo,
      close,
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
//
// Signature matches how page.tsx calls it:
//   useSimulation(marketId, connected, liveMarkPrice, liveIndexPrice)
//
// All args after marketId are optional so callers can omit them.

export function useSimulation(
  marketId: string = "BTC-PERP",
  connected: boolean = false,
  liveMarkPrice: number | null | undefined = null,
  liveIndexPrice: number | null | undefined = null,
) {
  const basePrice = getBasePrice(marketId);

  const userId = useRef<string>("");
  const trendRef = useRef(0);
  const markRef = useRef(basePrice);

  // Initialise userId once (client-side only)
  useEffect(() => {
    userId.current = getUserId();
  }, []);

  const [demo, setDemo] = useState<DemoState>(() => initialState(marketId));
  const [orderbook, setOrderbook] = useState(() =>
    buildSyntheticOrderbook(basePrice),
  );
  const [priceHistory, setPriceHistory] = useState(() =>
    initialHistory(Date.now(), basePrice),
  );
  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderFlash, setLastOrderFlash] = useState<"buy" | "sell" | null>(null);
  const [liquidated, setLiquidated] = useState(false);
  const [fundingRate, setFundingRate] = useState(0);
  const [orderToast, setOrderToast] = useState<OrderToast | null>(null);

  // Helper to show a toast and auto-dismiss it
  const showToast = useCallback((msg: string, type: OrderToast["type"], ms = 3_000) => {
    setOrderToast({ msg, type });
    setTimeout(() => setOrderToast(null), ms);
  }, []);

  // ── Reset when market changes ────────────────────────────────────────────────
  // (page.tsx calls resetDemo() on market switch, but also guard here)
  const prevMarketRef = useRef(marketId);
  useEffect(() => {
    if (prevMarketRef.current === marketId) return;
    prevMarketRef.current = marketId;
    const bp = getBasePrice(marketId);
    markRef.current = bp;
    trendRef.current = 0;
    setDemo(initialState(marketId));
    setOrderError(null);
    setLiquidated(false);
    setPriceHistory(initialHistory(Date.now(), bp));
    setOrderbook(buildSyntheticOrderbook(bp));
  }, [marketId]);

  // ── Sync liveMarkPrice into demo state ──────────────────────────────────────
  useEffect(() => {
    if (!connected || liveMarkPrice == null) return;
    markRef.current = liveMarkPrice;
    setDemo((prev) => {
      const index =
        liveIndexPrice != null
          ? liveIndexPrice
          : nextIndexPrice(liveMarkPrice, prev.indexPrice);

      // Liquidation check against live price
      if (prev.position) {
        const mr = marginRatio(prev.position, liveMarkPrice);
        if (mr <= 0.05) {
          setLiquidated(true);
          setTimeout(() => setLiquidated(false), 4_000);
          return {
            ...prev,
            position: null,
            markPrice: liveMarkPrice,
            indexPrice: index,
            trades: [
              {
                id: crypto.randomUUID(),
                side: prev.position.side === "Long" ? ("Sell" as const) : ("Buy" as const),
                price: liveMarkPrice,
                qty: prev.position.size,
                timestamp: Date.now(),
                pnl: -prev.position.margin,
              },
              ...prev.trades,
            ].slice(0, 100),
          };
        }
      }
      return { ...prev, markPrice: liveMarkPrice, indexPrice: index };
    });
  }, [liveMarkPrice, liveIndexPrice, connected]);

  // ── Sim tick loop (runs always; price ignored when live) ────────────────────
  useEffect(() => {
    const priceId = setInterval(() => {
      if (connected && liveMarkPrice != null) return; // driven by WS instead

      setDemo((prev) => {
        const mark = nextMarkPrice(
          prev.markPrice,
          VOLATILITY,
          trendRef.current * 0.00003,
        );
        const index = nextIndexPrice(mark, prev.indexPrice);
        trendRef.current = ((basePrice - mark) / basePrice) * 10;
        markRef.current = mark;

        if (prev.position) {
          const mr = marginRatio(prev.position, mark);
          if (mr <= 0.05) {
            setLiquidated(true);
            setTimeout(() => setLiquidated(false), 4_000);
            return {
              ...prev,
              position: null,
              markPrice: mark,
              indexPrice: index,
              trades: [
                {
                  id: crypto.randomUUID(),
                  side: prev.position.side === "Long" ? ("Sell" as const) : ("Buy" as const),
                  price: mark,
                  qty: prev.position.size,
                  timestamp: Date.now(),
                  pnl: -prev.position.margin,
                },
                ...prev.trades,
              ].slice(0, 100),
            };
          }
        }
        return { ...prev, markPrice: mark, indexPrice: index };
      });
    }, TICK_MS);

    // Orderbook rebuild (sim only)
    const obId = setInterval(() => {
      if (connected) return;
      setOrderbook(buildSyntheticOrderbook(markRef.current));
    }, TICK_MS + 80);

    // Candle history — always appends from current markRef
    const histId = setInterval(() => {
      const p = markRef.current;
      setPriceHistory((ph) => {
        const prev = ph[ph.length - 1];
        const open = prev?.close ?? p;
        const close = Math.round(p * 100) / 100;
        const hi = Math.round((Math.max(open, close) + Math.random() * p * 0.0003) * 100) / 100;
        const lo = Math.round((Math.min(open, close) - Math.random() * p * 0.0003) * 100) / 100;
        return [
          ...ph,
          { price: close, time: Date.now(), open, high: hi, low: lo, close },
        ].slice(-120);
      });
    }, TICK_MS + 160);

    return () => {
      clearInterval(priceId);
      clearInterval(obId);
      clearInterval(histId);
    };
  }, [connected, liveMarkPrice, basePrice]);

  // ── Live position polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;

    let cancelled = false;

    const poll = async () => {
      if (!userId.current) return;
      try {
        const pos = await api.getPosition(userId.current);
        if (cancelled) return;
        setDemo((prev) => ({
          ...prev,
          position: pos.size > 0 ? backendToSimPosition(pos) : null,
        }));
      } catch {
        if (!cancelled) {
          setDemo((prev) => ({ ...prev, position: null }));
        }
      }
    };

    poll();
    const id = setInterval(poll, POSITION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected]);

  // ── Live funding rate polling ────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const f = await api.getFundingRate();
        if (!cancelled) setFundingRate(f.funding_rate);
      } catch {
        /* ignore */
      }
    };

    poll();
    const id = setInterval(poll, FUNDING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected]);

  // ── placeOrder ───────────────────────────────────────────────────────────────
  const placeOrder = useCallback(
    async (params: OrderParams) => {
      setOrderError(null);

      if (connected && userId.current) {
        // ── LIVE: send to Rust backend ──
        const fillPrice = params.price ?? markRef.current;
        const margin = (fillPrice * params.qty) / params.leverage;

        showToast("Placing order…", "pending", 1_500);

        try {
          await api.placeOrder({
            user_id: userId.current,
            side: params.side,
            qty: params.qty,
            price: params.price,
            margin,
          });

          showToast(
            `${params.side === "Buy" ? "▲ Long" : "▼ Short"} order filled`,
            "success",
          );

          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);

          setDemo((prev) => ({
            ...prev,
            balance: Math.max(0, prev.balance - margin),
            trades: [
              {
                id: crypto.randomUUID(),
                side: params.side,
                price: fillPrice,
                qty: params.qty,
                timestamp: Date.now(),
              },
              ...prev.trades,
            ].slice(0, 100),
          }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Order failed";
          setOrderError(msg);
          showToast(msg, "error");
        }
      } else {
        // ── SIM: local execution ──
        setDemo((prev) => {
          const result = executeOrder(prev, params, prev.markPrice);
          if (!result.ok) {
            const msg = result.error ?? "Order failed";
            setOrderError(msg);
            showToast(msg, "error");
            return prev;
          }
          showToast(
            `${params.side === "Buy" ? "▲ Long" : "▼ Short"} order filled`,
            "success",
          );
          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);
          return { ...prev, ...result.newState };
        });
      }
    },
    [connected, showToast],
  );

  // ── closePosition ────────────────────────────────────────────────────────────
  const closePosition = useCallback(async () => {
    setDemo((prev) => {
      if (!prev.position) return prev;

      const closeSide: "Buy" | "Sell" =
        prev.position.side === "Long" ? "Sell" : "Buy";

      if (connected && userId.current) {
        const margin = prev.position.margin;
        api
          .placeOrder({
            user_id: userId.current,
            side: closeSide,
            qty: prev.position.size,
            margin,
          })
          .then(() => showToast("Position closed", "success"))
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "Close failed";
            showToast(msg, "error");
          });

        setLastOrderFlash(closeSide === "Buy" ? "buy" : "sell");
        setTimeout(() => setLastOrderFlash(null), 800);
        return prev; // position update comes from next poll
      }

      // Sim close
      const result = executeOrder(
        prev,
        { side: closeSide, qty: prev.position.size, leverage: prev.position.leverage },
        prev.markPrice,
      );
      if (!result.ok) return prev;
      showToast("Position closed", "success");
      setLastOrderFlash(closeSide === "Buy" ? "buy" : "sell");
      setTimeout(() => setLastOrderFlash(null), 800);
      return { ...prev, ...result.newState };
    });
  }, [connected, showToast]);

  // ── resetDemo ────────────────────────────────────────────────────────────────
  const resetDemo = useCallback(() => {
    const bp = getBasePrice(marketId);
    markRef.current = bp;
    trendRef.current = 0;
    setDemo(initialState(marketId));
    setOrderError(null);
    setLiquidated(false);
    setPriceHistory(initialHistory(Date.now(), bp));
    setOrderbook(buildSyntheticOrderbook(bp));
  }, [marketId]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const positionStats = demo.position
    ? {
        upnl: unrealisedPnl(demo.position, demo.markPrice),
        mr: marginRatio(demo.position, demo.markPrice),
        liqPrice: liquidationPrice(demo.position),
      }
    : null;

  const derivedFundingRate = connected
    ? fundingRate
    : (demo.markPrice - demo.indexPrice) / demo.indexPrice;

  return {
    demo,
    orderbook,
    priceHistory,
    positionStats,
    fundingRate: derivedFundingRate,
    orderError,
    lastOrderFlash,
    liquidated,
    orderToast,        // ← was missing, page.tsx destructures this
    placeOrder,
    closePosition,
    resetDemo,
    userId: userId.current,
  };
}