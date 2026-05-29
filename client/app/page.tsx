"use client";

import { useState, useEffect } from "react";
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
  id: string; label: string; basePrice: number;
}

const MARKETS: Market[] = [
  { id: "BTC-PERP", label: "BTC-PERP", basePrice: 65_000 },
  { id: "ETH-PERP", label: "ETH-PERP", basePrice: 3_200 },
  { id: "SOL-PERP", label: "SOL-PERP", basePrice: 180 },
  { id: "BNB-PERP", label: "BNB-PERP", basePrice: 580 },
  { id: "ARB-PERP", label: "ARB-PERP", basePrice: 1 },
  { id: "DOGE-PERP", label: "DOGE-PERP", basePrice: 0 },
];

type Tab = "position" | "history";

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen({ connected, market }: { connected: boolean; market: string }) {
  const [dots, setDots] = useState(".");
  const [phase, setPhase] = useState(0);

  const phases = [
    "Connecting to engine…",
    `Subscribing to ${market}…`,
    "Streaming orderbook…",
    "Ready.",
  ];

  useEffect(() => {
    const dotsId = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 400);
    const phaseId = setInterval(() => setPhase(p => Math.min(p + 1, phases.length - 1)), 700);
    return () => { clearInterval(dotsId); clearInterval(phaseId); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed", inset: 0, background: "var(--void)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", zIndex: 999,
      }}
    >
      {/* Grid bg */}
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.3, pointerEvents: "none" }} />

      <div style={{ position: "relative", textAlign: "center" }}>
        {/* Logo */}
        <motion.div
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{ fontSize: "22px", fontWeight: 600, color: "var(--acid)", letterSpacing: "0.2em", marginBottom: "32px" }}
          className="text-glow-acid"
        >
          PERP/DEX
        </motion.div>

        {/* Spinner */}
        <div style={{ position: "relative", width: 52, height: 52, margin: "0 auto 28px" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            style={{
              position: "absolute", inset: 0,
              border: "2px solid var(--border)",
              borderTopColor: "var(--acid)",
              borderRadius: "50%",
            }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            style={{
              position: "absolute", inset: 8,
              border: "1px solid var(--border)",
              borderBottomColor: "var(--plasma)",
              borderRadius: "50%",
            }}
          />
        </div>

        {/* Phase messages */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            style={{ fontSize: "12px", fontWeight: 300, color: "var(--text-dim)", letterSpacing: "0.04em", marginBottom: "12px" }}
          >
            {phases[phase]}
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
          {phases.map((_, i) => (
            <motion.div
              key={i}
              animate={{ background: i <= phase ? "var(--acid)" : "var(--muted)", scale: i === phase ? 1.3 : 1 }}
              transition={{ duration: 0.2 }}
              style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--muted)" }}
            />
          ))}
        </div>

        <div style={{ marginTop: "32px", fontSize: "10px", color: "var(--text-dim)", fontWeight: 300, letterSpacing: "0.08em" }}>
          {connected ? "● LIVE" : "○ SIM MODE"}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

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
            background: bgs[toast.type],
            border: `1px solid ${colors[toast.type]}`,
            borderRadius: 6, padding: "8px 18px",
            fontSize: "11px", fontWeight: 600,
            color: colors[toast.type],
            letterSpacing: "0.03em",
            zIndex: 200,
            backdropFilter: "blur(8px)",
            boxShadow: `0 0 20px ${colors[toast.type]}33`,
            whiteSpace: "nowrap",
            maxWidth: "90vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.type === "pending" && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{ marginRight: 6 }}
            >⬤</motion.span>
          )}
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Market selector ──────────────────────────────────────────────────────────

function MarketSelector({ markets, selected, onSelect, livePrices }: {
  markets: Market[];
  selected: string;
  onSelect: (id: string) => void;
  livePrices?: Record<string, { mark_price: number }>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", background: "var(--surface)", borderBottom: "1px solid var(--border)", overflowX: "auto", flexShrink: 0, zIndex: 2 }}>
      {markets.map((m) => {
        const active = m.id === selected;
        const lp = livePrices?.[m.id]?.mark_price;
        return (
          <button key={m.id} onClick={() => onSelect(m.id)} style={{
            padding: "5px 14px", background: active ? "var(--panel)" : "transparent",
            border: "none", borderBottom: `2px solid ${active ? "var(--acid)" : "transparent"}`,
            borderRight: "1px solid var(--border)",
            color: active ? "var(--text)" : "var(--text-dim)",
            fontSize: "10px", fontWeight: active ? 600 : 300,
            fontFamily: "var(--font-poppins)", letterSpacing: "0.06em",
            cursor: "pointer", whiteSpace: "nowrap",
            transition: "color 0.15s, background 0.15s", flexShrink: 0,
          }}>
            <div>{m.label}</div>
            {lp && (
              <div style={{ fontSize: "8px", color: active ? "var(--acid)" : "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                ${lp.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main trading view ────────────────────────────────────────────────────────

export default function TradingView() {
  const [selectedMarketId, setSelectedMarketId] = useState("BTC-PERP");
  const [appReady, setAppReady] = useState(false);

  // Mark app as ready after first render (sim is always immediately usable)
  useEffect(() => {
    const t = setTimeout(() => setAppReady(true), 1_200);
    return () => clearTimeout(t);
  }, []);

  // Live orderbook from WS (per selected market)
  const { data: liveOb, connected, bidDir, askDir } = useOrderbook(selectedMarketId);

  // Simulation + backend hybrid
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

  // Use live orderbook when connected, sim when not
  const displayOb = connected && liveOb.bids.length > 0
    ? { bids: liveOb.bids, asks: liveOb.asks, best_bid: liveOb.best_bid, best_ask: liveOb.best_ask }
    : { bids: orderbook.bids, asks: orderbook.asks, best_bid: orderbook.bids[0]?.price ?? null, best_ask: orderbook.asks[0]?.price ?? null };

  const [tab, setTab] = useState<Tab>("position");

  // Reset history seeding on market switch
  const handleMarketSelect = (id: string) => {
    setSelectedMarketId(id);
    resetDemo();
  };

  return (
    <>
      {/* Loading screen — shown until app is ready */}
      <AnimatePresence>
        {!appReady && <LoadingScreen connected={connected} market={selectedMarketId} />}
      </AnimatePresence>

      {/* Toast */}
      <Toast toast={orderToast ?? null} />

      <div style={{ width: "100%", minWidth: "1100px", height: "100dvh", overflow: "auto", background: "var(--void)" }}>
        <div style={{ width: "100%", maxWidth: "2500px", minWidth: "1100px", margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
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
            onSelect={handleMarketSelect}
          />

          {/* 3-column main grid */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 290px", gap: "1px", background: "var(--border)", minHeight: 0, position: "relative", zIndex: 1 }}>

            {/* LEFT */}
            <div style={{ display: "grid", gridTemplateRows: "1fr 190px", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <Orderbook
                bids={displayOb.bids}
                asks={displayOb.asks}
                bestBid={displayOb.best_bid}
                bestAsk={displayOb.best_ask}
                bidDir={bidDir}
                askDir={askDir}
                market={selectedMarketId}
              />
              <RecentTrades markPrice={demo.markPrice} />
            </div>

            {/* CENTER */}
            <div style={{ display: "grid", gridTemplateRows: "1fr 190px", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <PriceChart history={priceHistory} markPrice={demo.markPrice} liquidated={liquidated} />
              <TradeHistory trades={demo.trades} />
            </div>

            {/* RIGHT */}
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: "1px", background: "var(--border)", minHeight: 0 }}>
              <div style={{ overflowY: "auto", minHeight: 0 }}>
                <OrderForm
                  markPrice={demo.markPrice}
                  balance={demo.balance}
                  onOrder={placeOrder}
                  orderError={orderError}
                  lastFlash={lastOrderFlash}
                  market={selectedMarketId}
                />
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Tab bar */}
                <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                  {(["position", "history"] as Tab[]).map((t) => (
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
                          position={demo.position}
                          positionStats={positionStats}
                          markPrice={demo.markPrice}
                          balance={demo.balance}
                          onClose={closePosition}
                          liquidated={liquidated}
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
                <motion.div initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  style={{ background: "rgba(8,10,15,0.94)", border: "1px solid var(--plasma)", borderRadius: "8px", padding: "32px 52px", textAlign: "center", boxShadow: "0 0 60px rgba(255,59,107,0.25)" }}>
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>⚡</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--plasma)", letterSpacing: "0.15em", marginBottom: "8px" }}>LIQUIDATED</div>
                  <div style={{ fontSize: "11px", fontWeight: 300, color: "var(--text-dim)", lineHeight: 1.6 }}>
                    Your position was force-closed.<br />Margin has been taken by the engine.
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Order flash */}
          <AnimatePresence>
            {lastOrderFlash && (
              <motion.div key={lastOrderFlash} initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
                style={{ position: "absolute", inset: 0, background: lastOrderFlash === "buy" ? "rgba(0,255,136,0.05)" : "rgba(255,59,107,0.05)", pointerEvents: "none", zIndex: 50 }} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}