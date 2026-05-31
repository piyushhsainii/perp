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

// No query params — Rust handler only accepts plain /ws/orderbook
const WS_BASE = (
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080"
).replace(/\/+$/, "");
const WS_URL = `${WS_BASE}/ws/orderbook`;

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

export function useOrderbook(): UseOrderbookReturn {
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
  const unmounted = useRef(false);

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
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current || reconnCount.current >= MAX_RECONNECTS) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    console.log(
      `[WS] connecting to ${WS_URL} (attempt ${reconnCount.current + 1})`,
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error("[WS] failed to construct WebSocket:", e);
      reconnCount.current += 1;
      reconnTimer.current = setTimeout(connect, RECONNECT_MS);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) {
        ws.close();
        return;
      }
      console.log("[WS] ✓ connected to", WS_URL);
      reconnCount.current = 0;
      setConnected(true);
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (unmounted.current) return;
      try {
        const msg = JSON.parse(ev.data as string);
        console.log(
          "[WS] message:",
          msg.type,
          "bids:",
          msg.bids?.length,
          "asks:",
          msg.asks?.length,
          "mark:",
          msg.mark_price,
        );
        if (msg.type !== "orderbook") return;

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
      } catch (e) {
        console.warn("[WS] malformed message:", e);
      }
    };

    ws.onclose = (ev) => {
      if (unmounted.current) return;
      console.warn(
        `[WS] closed (code=${ev.code}) — retry ${reconnCount.current + 1}/${MAX_RECONNECTS}`,
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
      console.error("[WS] error:", e);
      ws.close();
    };
  }, [publish]);

  useEffect(() => {
    unmounted.current = false;
    reconnCount.current = 0;
    bidsMap.current.clear();
    asksMap.current.clear();
    setData(EMPTY);

    const t = setTimeout(connect, 80);

    return () => {
      unmounted.current = true;
      clearTimeout(t);
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  return { data, connected, bidDir, askDir };
}
