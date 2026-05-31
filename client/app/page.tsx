"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useSimulation } from "../hooks/useSimulation";
import { useOrderbook } from "../hooks/useOrderbook";

import TopBar from "../components/TopBar";
import PriceChart from "../components/PriceChart";
import Orderbook from "../components/Orderbook";
import OrderForm from "../components/OrderForm";
import PositionPanel from "../components/PositionPanel";
import RecentTrades from "../components/RecentTrades";
import TradeHistory from "../components/TradeHistory";
import FundingRate from "../components/FundingRate";

// ─── Markets ──────────────────────────────────────────────────────────────────

export interface Market {
  id: string;
  label: string;
  basePrice: number;
}

const MARKETS: Market[] = [
  { id: "BTC-PERP", label: "BTC-PERP", basePrice: 65_000 },
  { id: "ETH-PERP", label: "ETH-PERP", basePrice: 3_200 },
  { id: "SOL-PERP", label: "SOL-PERP", basePrice: 180 },
  { id: "BNB-PERP", label: "BNB-PERP", basePrice: 580 },
  { id: "ARB-PERP", label: "ARB-PERP", basePrice: 1 },
  { id: "DOGE-PERP", label: "DOGE-PERP", basePrice: 0.18 },
];

type Tab = "position" | "history";

// ─── Engine down overlay ──────────────────────────────────────────────────────
// Shown when the WS backend has never connected and all retries are exhausted.
// Blocks all trading — there is no sim fallback.

function EngineDownOverlay({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(4,6,10,0.96)",
        backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 0,
      }}
    >
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none" }} />

      <div style={{ position: "relative", textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        {/* Icon */}
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2.4 }}
          style={{ fontSize: 48, marginBottom: 20 }}
        >
          ⚙️
        </motion.div>

        {/* Title */}
        <div style={{
          fontSize: 18, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--plasma)", marginBottom: 10,
          textTransform: "uppercase",
        }}>
          DEX Engine Offline
        </div>

        {/* Description */}
        <div style={{
          fontSize: 12, fontWeight: 300, color: "var(--text-dim)",
          lineHeight: 1.7, marginBottom: 28, letterSpacing: "0.02em",
        }}>
          The trading engine is temporarily unavailable.<br />
          We're working to restore service as soon as possible.<br />
          No orders can be placed while the engine is offline.
        </div>

        {/* Status row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginBottom: 24,
          fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.08em",
        }}>
          <motion.span
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--plasma)", display: "inline-block",
            }}
          />
          {retrying ? "RECONNECTING…" : "CONNECTION FAILED"}
          <span style={{ opacity: 0.4 }}>· {elapsed}s</span>
        </div>

        {/* Retry button */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onRetry}
          disabled={retrying}
          style={{
            background: retrying ? "transparent" : "var(--surface)",
            border: `1px solid ${retrying ? "var(--border)" : "var(--text-dim)"}`,
            color: retrying ? "var(--text-dim)" : "var(--text)",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
            padding: "9px 28px", borderRadius: 4,
            cursor: retrying ? "not-allowed" : "pointer",
            fontFamily: "var(--font-poppins)",
            transition: "all 0.15s",
          }}
        >
          {retrying ? "RETRYING…" : "RETRY NOW"}
        </motion.button>

        <div style={{ marginTop: 20, fontSize: 9, color: "var(--text-dim)", opacity: 0.4, letterSpacing: "0.06em" }}>
          ws://localhost:8080/ws/orderbook
        </div>
      </div>
    </motion.div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
// Shown for the first ~1.5s while we wait to see if the WS connects.

function LoadingScreen({ market }: { market: string }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    "Connecting to engine…",
    `Subscribing to ${market}…`,
    "Streaming orderbook…",
  ];

  useEffect(() => {
    const id = setInterval(() => setPhase(p => Math.min(p + 1, phases.length - 1)), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed", inset: 0, background: "var(--void)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", zIndex: 999,
      }}
    >
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.3, pointerEvents: "none" }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <motion.div
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{ fontSize: 22, fontWeight: 700, color: "var(--acid)", letterSpacing: "0.2em", marginBottom: 32 }}
          className="text-glow-acid"
        >
          PERP/DEX
        </motion.div>

        <div style={{ position: "relative", width: 52, height: 52, margin: "0 auto 28px" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            style={{ position: "absolute", inset: 0, border: "2px solid var(--border)", borderTopColor: "var(--acid)", borderRadius: "50%" }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            style={{ position: "absolute", inset: 8, border: "1px solid var(--border)", borderBottomColor: "var(--plasma)", borderRadius: "50%" }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            style={{ fontSize: 12, fontWeight: 300, color: "var(--text-dim)", letterSpacing: "0.04em", marginBottom: 12 }}
          >
            {phases[phase]}
          </motion.div>
        </AnimatePresence>

        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {phases.map((_, i) => (
            <motion.div
              key={i}
              animate={{ background: i <= phase ? "var(--acid)" : "var(--muted)" }}
              style={{ width: 5, height: 5, borderRadius: "50%" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: { msg: string; type: "success" | "error" | "pending" } | null }) {
  const colors = { success: "var(--acid)", error: "var(--plasma)", pending: "var(--gold)" };
  const bgs = { success: "rgba(0,255,136,0.08)", error: "rgba(255,59,107,0.08)", pending: "rgba(240,165,0,0.08)" };
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.msg}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: bgs[toast.type], border: `1px solid ${colors[toast.type]}`,
            borderRadius: 6, padding: "8px 18px",
            fontSize: 11, fontWeight: 600, color: colors[toast.type],
            letterSpacing: "0.03em", zIndex: 200,
            backdropFilter: "blur(8px)",
            boxShadow: `0 0 20px ${colors[toast.type]}33`,
            whiteSpace: "nowrap", maxWidth: "90vw",
          }}
        >
          {toast.type === "pending" && (
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ marginRight: 6 }}>⬤</motion.span>
          )}
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Market selector ──────────────────────────────────────────────────────────

function MarketSelector({ markets, selected, onSelect }: {
  markets: Market[]; selected: string; onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", background: "var(--surface)", borderBottom: "1px solid var(--border)", overflowX: "auto", flexShrink: 0, zIndex: 2 }}>
      {markets.map(m => {
        const active = m.id === selected;
        return (
          <button key={m.id} onClick={() => onSelect(m.id)} style={{
            padding: "5px 14px", background: active ? "var(--panel)" : "transparent",
            border: "none", borderBottom: `2px solid ${active ? "var(--acid)" : "transparent"}`,
            borderRight: "1px solid var(--border)",
            color: active ? "var(--text)" : "var(--text-dim)",
            fontSize: 10, fontWeight: active ? 600 : 300,
            fontFamily: "var(--font-poppins)", letterSpacing: "0.06em",
            cursor: "pointer", whiteSpace: "nowrap",
            transition: "color 0.15s, background 0.15s", flexShrink: 0,
          }}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const WS_CONNECT_TIMEOUT_MS = 5_000; // how long to wait before declaring engine down

export default function TradingView() {
  const [selectedMarketId, setSelectedMarketId] = useState("BTC-PERP");

  // Three UI states:
  //   "loading"  — waiting to see if WS connects (first 5 s)
  //   "live"     — WS connected, backend running
  //   "down"     — WS failed, engine offline
  const [appState, setAppState] = useState<"loading" | "live" | "down">("loading");
  const [retrying, setRetrying] = useState(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: liveOb, connected, bidDir, askDir } = useOrderbook();

  // Transition: loading → live when WS connects
  useEffect(() => {
    if (connected) {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      setAppState("live");
      setRetrying(false);
    }
  }, [connected]);

  // Transition: loading → down if WS never connects within timeout
  useEffect(() => {
    if (appState !== "loading") return;
    connectTimeoutRef.current = setTimeout(() => {
      if (!connected) setAppState("down");
    }, WS_CONNECT_TIMEOUT_MS);
    return () => { if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current); };
  }, [appState]); // re-arm on every retry

  // Transition: live → down if WS drops after connecting
  useEffect(() => {
    if (appState === "live" && !connected) {
      // Give it 8 s to reconnect before showing the overlay
      connectTimeoutRef.current = setTimeout(() => {
        if (!connected) setAppState("down");
      }, 8_000);
      return () => { if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current); };
    }
  }, [appState, connected]);

  const handleRetry = () => {
    setRetrying(true);
    setAppState("loading"); // re-arm timeout, re-show loading screen briefly
  };

  const {
    demo, orderbook, priceHistory, positionStats, fundingRate,
    orderError, lastOrderFlash, liquidated, orderToast,
    placeOrder, closePosition, resetDemo,
  } = useSimulation(
    selectedMarketId,
    connected,
    liveOb.markPrice,
    liveOb.indexPrice,
  );

  // Only use live orderbook data — no sim fallback for the book
  const displayOb = connected && liveOb.bids.length > 0
    ? { bids: liveOb.bids, asks: liveOb.asks, best_bid: liveOb.best_bid, best_ask: liveOb.best_ask }
    : { bids: orderbook.bids, asks: orderbook.asks, best_bid: orderbook.bids[0]?.price ?? null, best_ask: orderbook.asks[0]?.price ?? null };

  const [tab, setTab] = useState<Tab>("position");

  return (
    <>
      {/* Loading screen */}
      <AnimatePresence>
        {appState === "loading" && <LoadingScreen market={selectedMarketId} />}
      </AnimatePresence>

      {/* Engine down overlay — blocks all interaction */}
      <AnimatePresence>
        {appState === "down" && (
          <EngineDownOverlay retrying={retrying} onRetry={handleRetry} />
        )}
      </AnimatePresence>

      {/* Toast */}
      <Toast toast={orderToast ?? null} />

      <div style={{ width: "100%", minWidth: "1100px", height: "100dvh", overflow: "auto", background: "var(--void)" }}>
        <div style={{
          width: "100%", maxWidth: "2500px", minWidth: "1100px",
          margin: "0 auto", height: "100dvh",
          display: "flex", flexDirection: "column",
          position: "relative", overflow: "hidden",
          // Dim the UI when engine is down but don't unmount (keeps layout stable)
          filter: appState === "down" ? "brightness(0.3)" : "none",
          pointerEvents: appState === "down" ? "none" : "auto",
          transition: "filter 0.4s",
        }}>
          <div className="grid-bg" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.3 }} />

          <TopBar
            markPrice={demo.markPrice}
            indexPrice={demo.indexPrice}
            fundingRate={fundingRate}
            balance={demo.balance}
            connected={connected}
            onReset={resetDemo}
          />

          <FundingRate rate={fundingRate} markPrice={demo.markPrice} indexPrice={demo.indexPrice} />

          <MarketSelector
            markets={MARKETS}
            selected={selectedMarketId}
            onSelect={id => { setSelectedMarketId(id); resetDemo(); }}
          />

          {/* 3-col grid */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 290px", gap: "1px", background: "var(--border)", minHeight: 0, position: "relative", zIndex: 1 }}>

            {/* LEFT */}
            <div style={{ display: "grid", gridTemplateRows: "1fr 190px", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <Orderbook
                bids={displayOb.bids} asks={displayOb.asks}
                bestBid={displayOb.best_bid} bestAsk={displayOb.best_ask}
                bidDir={bidDir} askDir={askDir} market={selectedMarketId}
              />
              <RecentTrades markPrice={demo.markPrice} />
            </div>

            {/* CENTER */}
            <div style={{ display: "grid", gridTemplateRows: "1fr 190px", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <PriceChart history={priceHistory} markPrice={demo.markPrice} liquidated={liquidated} market={selectedMarketId} />
              <TradeHistory trades={demo.trades} />
            </div>

            {/* RIGHT */}
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <div style={{ overflowY: "auto", minHeight: 0 }}>
                <OrderForm
                  markPrice={demo.markPrice} balance={demo.balance}
                  onOrder={placeOrder} orderError={orderError}
                  lastFlash={lastOrderFlash} market={selectedMarketId}
                />
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                  {(["position", "history"] as Tab[]).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      flex: 1, padding: "8px", fontSize: "8.5px",
                      letterSpacing: "0.1em", fontWeight: tab === t ? 700 : 300,
                      fontFamily: "var(--font-poppins)", background: "transparent", border: "none",
                      borderBottom: `2px solid ${tab === t ? "var(--acid)" : "transparent"}`,
                      color: tab === t ? "var(--acid)" : "var(--text-dim)",
                      cursor: "pointer", transition: "color 0.15s", textTransform: "uppercase",
                    }}>
                      {t === "position" ? "Position" : `History (${demo.trades.length})`}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <AnimatePresence mode="wait">
                    {tab === "position" ? (
                      <motion.div key="pos" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }} style={{ height: "100%" }}>
                        <PositionPanel
                          position={demo.position} positionStats={positionStats}
                          markPrice={demo.markPrice} balance={demo.balance}
                          onClose={closePosition} liquidated={liquidated}
                        />
                      </motion.div>
                    ) : (
                      <motion.div key="hist" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }} style={{ height: "100%" }}>
                        <TradeHistory trades={demo.trades} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Liquidation overlay */}
          <AnimatePresence>
            {liquidated && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 100 }}>
                <motion.div
                  initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  style={{ background: "rgba(8,10,15,0.94)", border: "1px solid var(--plasma)", borderRadius: 8, padding: "32px 52px", textAlign: "center", boxShadow: "0 0 60px rgba(255,59,107,0.25)" }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--plasma)", letterSpacing: "0.15em", marginBottom: 8 }}>LIQUIDATED</div>
                  <div style={{ fontSize: 11, fontWeight: 300, color: "var(--text-dim)", lineHeight: 1.6 }}>
                    Your position was force-closed.<br />Margin has been taken by the engine.
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Order flash */}
          <AnimatePresence>
            {lastOrderFlash && (
              <motion.div
                key={lastOrderFlash}
                initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                style={{ position: "absolute", inset: 0, background: lastOrderFlash === "buy" ? "rgba(0,255,136,0.05)" : "rgba(255,59,107,0.05)", pointerEvents: "none", zIndex: 50 }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}