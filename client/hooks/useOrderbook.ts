"use client";

/**
 * useOrderbook.ts
 *
 * Connects to ws://localhost:8080/ws/orderbook (the Rust backend).
 *
 * Backend message shape (every engine event):
 *   {
 *     type: "orderbook",
 *     symbol: "BTC-PERP",
 *     bids: [{ price: number, qty: number }, ...],   ← objects, NOT tuples
 *     asks: [{ price: number, qty: number }, ...],
 *     best_bid: number | null,
 *     best_ask: number | null,
 *   }
 *
 * Exported shape is compatible with the sim orderbook so TradingView
 * can swap between them without adapters.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderLevel {
  price: number;
  qty: number;
  total?: number; // cumulative depth — computed here
}

export interface OrderbookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  best_bid: number | null;
  best_ask: number | null;
}

export type PriceDir = "up" | "down" | null;

export interface UseOrderbookReturn {
  data: OrderbookData;
  connected: boolean;
  markPrice: number | null; // (best_bid + best_ask) / 2 when live
  bidDir: PriceDir;
  askDir: PriceDir;
}

// ─── Backend wire format ──────────────────────────────────────────────────────

interface BackendLevel {
  price: number;
  qty: number;
}

interface BackendMessage {
  type: "orderbook" | "trades";
  symbol?: string;
  bids?: BackendLevel[];
  asks?: BackendLevel[];
  best_bid?: number | null;
  best_ask?: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Fix: backend route is /ws/orderbook, not /ws
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws/orderbook";
const DEPTH = 15;
const RECONNECT_MS = 2_000;
const MAX_RETRIES = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withDepth(levels: OrderLevel[]): OrderLevel[] {
  let cum = 0;
  return levels.map((l) => {
    cum += l.qty;
    return { ...l, total: cum };
  });
}

const EMPTY: OrderbookData = {
  bids: [],
  asks: [],
  best_bid: null,
  best_ask: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrderbook(): UseOrderbookReturn {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<OrderbookData>(EMPTY);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [bidDir, setBidDir] = useState<PriceDir>(null);
  const [askDir, setAskDir] = useState<PriceDir>(null);

  const prevBestBid = useRef<number | null>(null);
  const prevBestAsk = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const publish = useCallback((msg: BackendMessage) => {
    // Backend already gives us sorted bids (desc) and asks (asc), just slice
    const rawBids = (msg.bids ?? []).slice(0, DEPTH);
    const rawAsks = (msg.asks ?? []).slice(0, DEPTH);

    const bids = withDepth(
      rawBids.map((l) => ({ price: l.price, qty: l.qty })),
    );
    const asks = withDepth(
      rawAsks.map((l) => ({ price: l.price, qty: l.qty })),
    );

    // Prefer the backend's computed best prices; fall back to first row
    const best_bid = msg.best_bid ?? bids[0]?.price ?? null;
    const best_ask = msg.best_ask ?? asks[0]?.price ?? null;

    // Direction flash
    if (
      best_bid !== null &&
      prevBestBid.current !== null &&
      best_bid !== prevBestBid.current
    ) {
      setBidDir(best_bid > prevBestBid.current ? "up" : "down");
      if (bidTimer.current) clearTimeout(bidTimer.current);
      bidTimer.current = setTimeout(() => setBidDir(null), 400);
    }
    if (
      best_ask !== null &&
      prevBestAsk.current !== null &&
      best_ask !== prevBestAsk.current
    ) {
      setAskDir(best_ask > prevBestAsk.current ? "up" : "down");
      if (askTimer.current) clearTimeout(askTimer.current);
      askTimer.current = setTimeout(() => setAskDir(null), 400);
    }

    prevBestBid.current = best_bid;
    prevBestAsk.current = best_ask;

    setData({ bids, asks, best_bid, best_ask });
    console.log("[parsed]", {
      bids,
      asks,
      best_bid,
      best_ask,
    });
    // Derive mark price from midpoint
    if (best_bid !== null && best_ask !== null) {
      setMarkPrice((best_bid + best_ask) / 2);
    }
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current || retries.current >= MAX_RETRIES) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) {
        ws.close();
        return;
      }
      retries.current = 0;
      setConnected(true);
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (unmounted.current) return;
      try {
        const msg = JSON.parse(ev.data as string) as BackendMessage;
        if (msg.type === "orderbook") {
          publish(msg);
          console.log("[publish]", msg);
        }
        // 'trades' messages are handled separately if needed
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnected(false);
      setMarkPrice(null);
      retries.current += 1;
      if (retries.current < MAX_RETRIES) {
        retryTimer.current = setTimeout(connect, RECONNECT_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [publish]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (bidTimer.current) clearTimeout(bidTimer.current);
      if (askTimer.current) clearTimeout(askTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, connected, markPrice, bidDir, askDir };
}
