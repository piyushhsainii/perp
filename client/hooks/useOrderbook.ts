"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface OrderLevel {
  price: number;
  qty: number;
  total?: number;
}

export interface OrderbookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  best_bid: number | null;
  best_ask: number | null;
  markPrice?: number;
  indexPrice?: number;
  fundingRate?: number;
}

export type PriceDir = "up" | "down" | null;

export interface UseOrderbookReturn {
  data: OrderbookData;
  connected: boolean;
  bidDir: PriceDir;
  askDir: PriceDir;
}

// ─── CRITICAL FIX: full path in URL, not just the base ────────────────────────
const WS_BASE = (
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080"
).replace(/\/+$/, ""); // strip trailing slash

const DEPTH = 16;
const RECONNECT_MS = 3_000;
const MAX_RECONNECTS = 8;

function withRunningTotal(levels: OrderLevel[]): OrderLevel[] {
  let running = 0;
  return levels.map((l) => {
    running += l.qty;
    return { ...l, total: running };
  });
}

const EMPTY: OrderbookData = {
  bids: [],
  asks: [],
  best_bid: null,
  best_ask: null,
};

export function useOrderbook(market = "BTC-PERP"): UseOrderbookReturn {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<OrderbookData>(EMPTY);
  const [bidDir, setBidDir] = useState<PriceDir>(null);
  const [askDir, setAskDir] = useState<PriceDir>(null);

  const bidsMap = useRef<Map<number, number>>(new Map());
  const asksMap = useRef<Map<number, number>>(new Map());
  const prevBestBid = useRef<number | null>(null);
  const prevBestAsk = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnCount = useRef(0);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref so connect() never closes over a stale value
  const marketRef = useRef(market);
  marketRef.current = market;

  const publish = useCallback((extras: Partial<OrderbookData> = {}) => {
    const bids = withRunningTotal(
      [...bidsMap.current.entries()]
        .sort(([a], [b]) => b - a)
        .slice(0, DEPTH)
        .map(([price, qty]) => ({ price, qty })),
    );
    const asks = withRunningTotal(
      [...asksMap.current.entries()]
        .sort(([a], [b]) => a - b)
        .slice(0, DEPTH)
        .map(([price, qty]) => ({ price, qty })),
    );

    const best_bid = bids[0]?.price ?? null;
    const best_ask = asks[0]?.price ?? null;

    // Direction flash
    if (
      best_bid !== null &&
      prevBestBid.current !== null &&
      best_bid !== prevBestBid.current
    ) {
      setBidDir(best_bid > prevBestBid.current ? "up" : "down");
      setTimeout(() => setBidDir(null), 400);
    }
    if (
      best_ask !== null &&
      prevBestAsk.current !== null &&
      best_ask !== prevBestAsk.current
    ) {
      setAskDir(best_ask > prevBestAsk.current ? "up" : "down");
      setTimeout(() => setAskDir(null), 400);
    }
    prevBestBid.current = best_bid;
    prevBestAsk.current = best_ask;

    setData({ bids, asks, best_bid, best_ask, ...extras });
  }, []); // stable — no deps needed

  // ─── connect is STABLE — no deps that change ──────────────────────────────
  // We read market from marketRef.current so we don't need market in deps
  const connect = useCallback(() => {
    if (reconnCount.current >= MAX_RECONNECTS) return;

    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop from old socket
      wsRef.current.close();
      wsRef.current = null;
    }

    // ─── THE KEY FIX: append full path + market query param ───────────────
    const url = `${WS_BASE}/ws/orderbook?market=${encodeURIComponent(marketRef.current)}`;
    console.log(`[WS] connecting to ${url}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      reconnCount.current += 1;
      reconnTimer.current = setTimeout(connect, RECONNECT_MS);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[WS] connected — market=${marketRef.current}`);
      reconnCount.current = 0;
      setConnected(true);
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type !== "orderbook") return;

        // Backend sends objects {price, qty} — NOT tuples
        bidsMap.current.clear();
        asksMap.current.clear();
        for (const b of msg.bids ?? [])
          if (b.qty > 0) bidsMap.current.set(b.price, b.qty);
        for (const a of msg.asks ?? [])
          if (a.qty > 0) asksMap.current.set(a.price, a.qty);

        publish({
          markPrice: msg.mark_price,
          indexPrice: msg.index_price,
          fundingRate: msg.funding_rate,
        });
      } catch {
        // malformed — ignore
      }
    };

    ws.onclose = () => {
      console.log(
        `[WS] closed — will retry in ${RECONNECT_MS}ms (attempt ${reconnCount.current + 1})`,
      );
      setConnected(false);
      bidsMap.current.clear();
      asksMap.current.clear();
      reconnCount.current += 1;
      if (reconnCount.current < MAX_RECONNECTS) {
        reconnTimer.current = setTimeout(connect, RECONNECT_MS);
      } else {
        console.warn("[WS] max reconnects reached — staying in SIM mode");
      }
    };

    ws.onerror = (e) => {
      console.warn("[WS] error", e);
      ws.close(); // onclose handles retry
    };
  }, [publish]); // publish is stable, so connect is stable

  // ─── Mount once, reconnect on market change ───────────────────────────────
  useEffect(() => {
    reconnCount.current = 0;
    bidsMap.current.clear();
    asksMap.current.clear();
    setData(EMPTY);

    // Small delay on market switch so cleanup settles
    const t = setTimeout(connect, 80);

    return () => {
      clearTimeout(t);
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [connect, market]); // market change triggers reconnect to new channel

  return { data, connected, bidDir, askDir };
}
