'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { useSimulation } from '../hooks/useSimulation'
import { useOrderbook } from '../hooks/useOrderbook'

import TopBar from '../components/TopBar'
import PriceChart from '../components/PriceChart'
import Orderbook from '../components/Orderbook'
import OrderForm from '../components/OrderForm'
import PositionPanel from '../components/PositionPanel'
import RecentTrades from '../components/RecentTrades'
import TradeHistory from '../components/TradeHistory'
import FundingRate from '../components/FundingRate'

// ─── Markets config ───────────────────────────────────────────────────────────

export interface Market {
  id: string
  label: string
  base: string
  basePrice: number
  tickSize: number
}

const MARKETS: Market[] = [
  { id: 'BTC-PERP', label: 'BTC-PERP', base: 'BTC', basePrice: 65_000, tickSize: 0.5 },
  { id: 'ETH-PERP', label: 'ETH-PERP', base: 'ETH', basePrice: 3_200, tickSize: 0.1 },
  { id: 'SOL-PERP', label: 'SOL-PERP', base: 'SOL', basePrice: 180, tickSize: 0.01 },
  { id: 'BNB-PERP', label: 'BNB-PERP', base: 'BNB', basePrice: 580, tickSize: 0.1 },
  { id: 'ARB-PERP', label: 'ARB-PERP', base: 'ARB', basePrice: 1.20, tickSize: 0.001 },
  { id: 'DOGE-PERP', label: 'DOGE-PERP', base: 'DOGE', basePrice: 0.18, tickSize: 0.0001 },
]

type Tab = 'position' | 'history'

// ─── Market selector ──────────────────────────────────────────────────────────

function MarketSelector({
  markets, selected, onSelect,
}: {
  markets: Market[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto', flexShrink: 0, zIndex: 2,
    }}>
      {markets.map(m => {
        const active = m.id === selected
        return (
          <button key={m.id} onClick={() => onSelect(m.id)} style={{
            padding: '6px 14px',
            background: active ? 'var(--panel)' : 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active ? 'var(--acid)' : 'transparent'}`,
            borderRight: '1px solid var(--border)',
            color: active ? 'var(--text)' : 'var(--text-dim)',
            fontSize: '10px', fontWeight: active ? 700 : 300,
            fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'color 0.15s, background 0.15s', flexShrink: 0,
          }}>
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function TradingView() {
  const [selectedMarketId, setSelectedMarketId] = useState<string>('BTC-PERP')
  const selectedMarket = MARKETS.find(m => m.id === selectedMarketId) ?? MARKETS[0]

  // ── Live orderbook WS ──
  // markPrice comes from WS midpoint; null when disconnected
  const { data: liveOb, connected, markPrice: liveMarkPrice, bidDir, askDir } = useOrderbook()

  console.log(`askDir`, askDir)
  console.log(`bidDir`, bidDir)
  console.log('live', liveOb)
  // ── Trading engine ──
  // Passes live price + connection state so the hook can switch modes
  const {
    demo, orderbook, priceHistory, positionStats,
    fundingRate, orderError, lastOrderFlash, liquidated,
    placeOrder, closePosition, resetDemo,
  } = useSimulation({ connected, liveMarkPrice })

  // ── Orderbook display: live when connected, sim when not ──
  const displayOb = connected && liveOb.bids.length > 0
    ? liveOb
    : {
      bids: orderbook.bids,
      asks: orderbook.asks,
      best_bid: orderbook.bids[0]?.price ?? null,
      best_ask: orderbook.asks[0]?.price ?? null,
    }

  const [tab, setTab] = useState<Tab>('position')

  return (
    <div style={{ width: '100%', minWidth: '1100px', height: '100dvh', overflow: 'auto', background: 'var(--void)' }}>
      <div style={{
        width: '100%', maxWidth: '2500px', minWidth: '1100px',
        margin: '0 auto', height: '100dvh',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.3 }} />

        {/* TopBar — includes scrolling spot ticker */}
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
          onSelect={id => { setSelectedMarketId(id); resetDemo() }}
        />

        {/* ── 3-col grid ── */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '220px 1fr 290px',
          gap: '1px',
          background: 'var(--border)',
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
        }}>
          {/* LEFT */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 190px', gap: '1px', background: 'var(--border)', minHeight: 0 }}>
            <Orderbook
              bids={displayOb.bids}
              asks={displayOb.asks}
              bestBid={displayOb.best_bid}
              bestAsk={displayOb.best_ask}
              bidDir={bidDir}
              askDir={askDir}
              market={selectedMarket.id}
            />
            <RecentTrades markPrice={demo.markPrice} />
          </div>

          {/* CENTER */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 190px', gap: '1px', background: 'var(--border)', minHeight: 0 }}>
            <PriceChart
              history={priceHistory}
              markPrice={demo.markPrice}
              liquidated={liquidated}
              market={selectedMarket.id}
            />
            <TradeHistory trades={demo.trades} />
          </div>

          {/* RIGHT */}
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '1px', background: 'var(--border)', minHeight: 0 }}>
            <div style={{ overflowY: 'auto', minHeight: 0 }}>
              <OrderForm
                markPrice={demo.markPrice}
                balance={demo.balance}
                onOrder={placeOrder}
                orderError={orderError}
                lastFlash={lastOrderFlash}
                market={selectedMarket.id}
              />
            </div>

            {/* Position / History tabs */}
            <div style={{
              background: 'var(--panel)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', minHeight: 0,
            }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {(['position', 'history'] as Tab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flex: 1, padding: '8px',
                    fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: tab === t ? 700 : 300,
                    fontFamily: 'var(--font-poppins)',
                    background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${tab === t ? 'var(--acid)' : 'transparent'}`,
                    color: tab === t ? 'var(--acid)' : 'var(--text-dim)',
                    cursor: 'pointer', transition: 'color 0.15s', textTransform: 'uppercase',
                  }}>
                    {t === 'position' ? 'Position' : `History (${demo.trades.length})`}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <AnimatePresence mode="wait">
                  {tab === 'position' ? (
                    <motion.div key="pos"
                      initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }}
                      style={{ height: '100%' }}
                    >
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
                    <motion.div key="hist"
                      initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }}
                      style={{ height: '100%' }}
                    >
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
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 100 }}
            >
              <motion.div
                initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                style={{
                  background: 'rgba(8,10,15,0.94)', border: '1px solid var(--plasma)',
                  borderRadius: '8px', padding: '32px 52px', textAlign: 'center',
                  boxShadow: '0 0 60px rgba(255,59,107,0.25)',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>⚡</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--plasma)', letterSpacing: '0.15em', marginBottom: '8px' }}>
                  LIQUIDATED
                </div>
                <div style={{ fontSize: '11px', fontWeight: 300, color: 'var(--text-dim)', lineHeight: 1.6 }}>
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
              style={{
                position: 'absolute', inset: 0,
                background: lastOrderFlash === 'buy' ? 'rgba(0,255,136,0.05)' : 'rgba(255,59,107,0.05)',
                pointerEvents: 'none', zIndex: 50,
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}