"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OrderLevel } from "../hooks/useOrderbook";

interface OrderbookProps {
  bids: OrderLevel[];
  asks: OrderLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  bidDir: "up" | "down" | null;
  askDir: "up" | "down" | null;
  market?: string;
}

const ROW_COUNT = 16;

export default function Orderbook({ bids, asks, bestBid, bestAsk, bidDir, askDir, market }: OrderbookProps) {
  const topAsks = useMemo(
    () => [...asks].sort((a, b) => a.price - b.price).slice(0, ROW_COUNT).reverse(),
    [asks]
  );
  const topBids = useMemo(
    () => [...bids].sort((a, b) => b.price - a.price).slice(0, ROW_COUNT),
    [bids]
  );

  const maxAskQty = useMemo(() => Math.max(...topAsks.map((a) => a.qty), 1), [topAsks]);
  const maxBidQty = useMemo(() => Math.max(...topBids.map((b) => b.qty), 1), [topBids]);

  const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
  const spreadPct =
    bestAsk && bestBid ? (((bestAsk - bestBid) / bestAsk) * 100).toFixed(3) : null;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "7px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
          {market ?? "BTC-PERP"} Book
        </span>
        {spread !== null && (
          <span style={{ fontSize: "9px", color: "var(--gold)", fontWeight: 300 }}>
            Spread {spread} ({spreadPct}%)
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "40% 28% 32%", padding: "4px 10px", fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-dim)", borderBottom: "1px solid var(--border)", flexShrink: 0, textTransform: "uppercase" }}>
        <span>Price</span>
        <span style={{ textAlign: "right" }}>Size</span>
        <span style={{ textAlign: "right" }}>Total</span>
      </div>

      {/* ASKS — scroll independently */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {topAsks.map((level) => (
            <BookRow
              // FIX: prefix with side to guarantee uniqueness across bid/ask keys
              key={`ask-${level.price}`}
              level={level}
              maxQty={maxAskQty}
              side="ask"
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Spread divider */}
      <div style={{ padding: "5px 10px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(0,0,0,0.2)" }}>
        <motion.span
          key={`ask-best-${bestAsk ?? 0}`}
          animate={{ opacity: [0.5, 1] }}
          transition={{ duration: 0.15 }}
          style={{ fontSize: "13px", fontWeight: 600, color: "var(--plasma)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
        >
          {bestAsk ? bestAsk.toLocaleString() : "—"}
        </motion.span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)", fontWeight: 300 }}>
          mid {bestBid && bestAsk ? Math.round((bestBid + bestAsk) / 2).toLocaleString() : "—"}
        </span>
        <motion.span
          key={`bid-best-${bestBid ?? 0}`}
          animate={{ opacity: [0.5, 1] }}
          transition={{ duration: 0.15 }}
          style={{ fontSize: "13px", fontWeight: 600, color: "var(--acid)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
        >
          {bestBid ? bestBid.toLocaleString() : "—"}
        </motion.span>
      </div>

      {/* BIDS — scroll independently */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {topBids.map((level) => (
            <BookRow
              key={`bid-${level.price}`}
              level={level}
              maxQty={maxBidQty}
              side="bid"
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BookRow({ level, maxQty, side }: { level: OrderLevel; maxQty: number; side: "bid" | "ask" }) {
  const pct = Math.min(100, (level.qty / maxQty) * 100);
  const isBid = side === "bid";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isBid ? -8 : 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isBid ? -8 : 8 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{ position: "relative", display: "grid", gridTemplateColumns: "40% 28% 32%", padding: "0 10px", height: "20px", alignItems: "center", cursor: "default", userSelect: "none" }}
    >
      {/* Depth bar — use opacity animation NOT backgroundColor to avoid Framer Motion warning */}
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{ position: "absolute", insetBlock: "1px", right: 0, opacity: 0.7, background: isBid ? "rgba(0,255,136,0.1)" : "rgba(255,59,107,0.12)", pointerEvents: "none" }}
      />
      <span style={{ color: isBid ? "var(--acid)" : "var(--plasma)", fontSize: "11px", fontWeight: 300, letterSpacing: "-0.02em", position: "relative", zIndex: 1, fontVariantNumeric: "tabular-nums" }}>
        {level.price.toLocaleString()}
      </span>
      <span style={{ color: "var(--text)", fontSize: "10px", fontWeight: 300, textAlign: "right", position: "relative", zIndex: 1, fontVariantNumeric: "tabular-nums" }}>
        {level.qty}
      </span>
      <span style={{ color: "var(--text-dim)", fontSize: "9px", fontWeight: 300, textAlign: "right", position: "relative", zIndex: 1, fontVariantNumeric: "tabular-nums" }}>
        {(level.price * level.qty).toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </motion.div>
  );
}