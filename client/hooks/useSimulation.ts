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
} from "../lib/simulation";
import * as api from "../lib/api";
import type { Position as BackendPosition } from "../lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const TICK_MS = 900;
const VOLATILITY = 0.0009;
const STARTING_BALANCE = 500;
const POSITION_POLL_MS = 2_000;
const FUNDING_POLL_MS = 30_000;

// ─── User identity ────────────────────────────────────────────────────────────
// Initialised synchronously so it's ready before the first poll / order fires.

function getUserId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const stored = localStorage.getItem("perp_user_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("perp_user_id", id);
  return id;
}

// Stable reference — created once outside the hook so it never re-initialises.
// Safe because localStorage is only accessed after hydration (this module is
// "use client" and the value is computed lazily on first import).
let _cachedUserId: string | null = null;
function getStableUserId(): string {
  if (!_cachedUserId) _cachedUserId = getUserId();
  return _cachedUserId;
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

const INITIAL_PRICE = 65_000;

function initialState(): DemoState {
  return {
    balance: STARTING_BALANCE,
    position: null,
    trades: [],
    markPrice: INITIAL_PRICE,
    indexPrice: INITIAL_PRICE - 50,
  };
}

function initialHistory(now: number) {
  let p = INITIAL_PRICE;
  return Array.from({ length: 80 }, (_, i) => {
    const open = Math.round(p);
    p = Math.max(100, p + (Math.random() - 0.498) * p * VOLATILITY * 5);
    const close = Math.round(p);
    const hi = Math.round(Math.max(open, close) + Math.random() * p * 0.0004);
    const lo = Math.round(Math.min(open, close) - Math.random() * p * 0.0004);
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

interface UseSimulationOptions {
  liveMarkPrice?: number | null;
  connected?: boolean;
}

export function useSimulation(opts: UseSimulationOptions = {}) {
  const { liveMarkPrice, connected = false } = opts;

  // userId is stable from the very first render — no useEffect race
  const userId = useRef<string>(
    typeof window !== "undefined" ? getStableUserId() : "",
  );
  const trendRef = useRef(0);
  const markRef = useRef(INITIAL_PRICE);

  const [demo, setDemo] = useState<DemoState>(initialState);
  const [orderbook, setOrderbook] = useState(() =>
    buildSyntheticOrderbook(INITIAL_PRICE),
  );
  const [priceHistory, setPriceHistory] = useState(() =>
    initialHistory(Date.now()),
  );
  const [orderError, setOrderError] = useState<string | null>(null);
  const [lastOrderFlash, setLastOrderFlash] = useState<"buy" | "sell" | null>(
    null,
  );
  const [liquidated, setLiquidated] = useState(false);
  const [fundingRate, setFundingRate] = useState(0);

  // ── Ensure userId is set after SSR hydration ──────────────────────────────
  useEffect(() => {
    if (!userId.current) userId.current = getStableUserId();
  }, []);

  // ── Sync liveMarkPrice → demo state ──────────────────────────────────────
  useEffect(() => {
    if (!connected || liveMarkPrice == null) return;
    markRef.current = liveMarkPrice;
    setDemo((prev) => {
      const index = nextIndexPrice(liveMarkPrice, prev.indexPrice);
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
                side:
                  prev.position.side === "Long"
                    ? ("Sell" as const)
                    : ("Buy" as const),
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
  }, [liveMarkPrice, connected]);

  // ── Sim tick loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const priceId = setInterval(() => {
      if (connected && liveMarkPrice != null) return;

      setDemo((prev) => {
        const mark = nextMarkPrice(
          prev.markPrice,
          VOLATILITY,
          trendRef.current * 0.00003,
        );
        const index = nextIndexPrice(mark, prev.indexPrice);
        trendRef.current = ((INITIAL_PRICE - mark) / INITIAL_PRICE) * 10;
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
                  side:
                    prev.position.side === "Long"
                      ? ("Sell" as const)
                      : ("Buy" as const),
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

    const obId = setInterval(() => {
      if (connected) return;
      setOrderbook(buildSyntheticOrderbook(markRef.current));
    }, TICK_MS + 80);

    const histId = setInterval(() => {
      const p = markRef.current;
      setPriceHistory((ph) => {
        const prev = ph[ph.length - 1];
        const open = prev?.close ?? p;
        const close = Math.round(p);
        const hi = Math.round(
          Math.max(open, close) + Math.random() * p * 0.0003,
        );
        const lo = Math.round(
          Math.min(open, close) - Math.random() * p * 0.0003,
        );
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
  }, [connected, liveMarkPrice]);

  // ── Live position polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;

    let cancelled = false;

    const poll = async () => {
      const uid = userId.current;
      if (!uid) return;
      try {
        const pos = await api.getPosition(uid);
        if (cancelled) return;
        setDemo((prev) => ({
          ...prev,
          position: pos.size > 0 ? backendToSimPosition(pos) : null,
        }));
      } catch {
        // 404 when no position — normal
        if (!cancelled) setDemo((prev) => ({ ...prev, position: null }));
      }
    };

    poll();
    const id = setInterval(poll, POSITION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected]);

  // ── Live funding rate polling ─────────────────────────────────────────────
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

  // ── placeOrder ────────────────────────────────────────────────────────────
  const placeOrder = useCallback(
    async (params: OrderParams) => {
      setOrderError(null);

      if (connected && userId.current) {
        const fillPrice = params.price ?? markRef.current;
        const margin = (fillPrice * params.qty) / params.leverage;

        try {
          await api.placeOrder({
            user_id: userId.current,
            side: params.side,
            qty: params.qty,
            price: params.price,
            margin,
          });
          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);

          // Optimistic balance deduction; real position arrives via next poll
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
          setOrderError(err instanceof Error ? err.message : "Order failed");
        }
      } else {
        // Sim path
        setDemo((prev) => {
          const result = executeOrder(prev, params, prev.markPrice);
          if (!result.ok) {
            setOrderError(result.error ?? "Order failed");
            return prev;
          }
          setLastOrderFlash(params.side === "Buy" ? "buy" : "sell");
          setTimeout(() => setLastOrderFlash(null), 800);
          return { ...prev, ...result.newState };
        });
      }
    },
    [connected],
  );

  // ── closePosition ─────────────────────────────────────────────────────────
  const closePosition = useCallback(async () => {
    setDemo((prev) => {
      if (!prev.position) return prev;

      const closeSide: "Buy" | "Sell" =
        prev.position.side === "Long" ? "Sell" : "Buy";

      if (connected && userId.current) {
        const fillPrice = markRef.current;
        api
          .placeOrder({
            user_id: userId.current,
            side: closeSide,
            qty: prev.position.size,
            margin: prev.position.margin,
          })
          .catch(console.error);

        setLastOrderFlash(closeSide === "Buy" ? "buy" : "sell");
        setTimeout(() => setLastOrderFlash(null), 800);
        return prev; // position update comes from next poll
      }

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
  }, [connected]);

  // ── resetDemo ─────────────────────────────────────────────────────────────
  const resetDemo = useCallback(() => {
    markRef.current = INITIAL_PRICE;
    trendRef.current = 0;
    setDemo(initialState());
    setOrderError(null);
    setLiquidated(false);
    setPriceHistory(initialHistory(Date.now()));
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
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
    placeOrder,
    closePosition,
    resetDemo,
    userId: userId.current,
  };
}
