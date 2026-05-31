# PERP/DEX — Perpetual Futures Exchange

> A production-architecture perpetual futures exchange simulation built for the contest.  
> Full-stack: Rust matching engine backend + Next.js 14 trading UI frontend.

---

<img width="1431" height="816" alt="Screenshot 2026-05-31 at 9 34 34 PM" src="https://github.com/user-attachments/assets/2564bb43-66f5-43ab-a299-cd214377d7d1" />


## What Is PERP/DEX?

**PERP/DEX** is a fully functional perpetual futures trading simulator that mimics real exchange mechanics — order matching, position management, funding rates, liquidations, and a live streaming orderbook. It ships with a built-in simulation engine so the frontend works completely standalone, and seamlessly upgrades to live data when the Rust backend is running.

---

## Features

- **Live Orderbook Streaming** via WebSocket with bid/ask direction indicators
- **Perpetual Futures Trading** — Long/Short, Market/Limit orders with leverage up to 50×
- **Position Management** — Real-time unrealised P&L, margin health bar, liquidation price
- **Liquidation Engine** — Auto-liquidation at 5% margin ratio with full-screen animation
- **Funding Rate** — Derived from mark/index price divergence, applied every 8 hours
- **Multi-Market Support** — BTC-PERP, ETH-PERP, SOL-PERP, BNB-PERP, ARB-PERP, DOGE-PERP
- **Simulation Mode** — Random walk price engine runs entirely in-browser; no backend required
- **Event Sourcing** — JSONL write-ahead log + JSON snapshots on the Rust backend
- **Phantom Wallet Integration** — Connect your Solana wallet via the top bar
- **State Persistence** — Save/load orderbook snapshots via REST API

---

## Tech Stack

| Layer | Technology |
|---|---|
| Matching Engine | Rust, Actix-web 4, Tokio |
| State Persistence | Event sourcing — JSONL event log + JSON snapshots |
| Real-time API | WebSocket via actix-ws + tokio::broadcast |
| Frontend Framework | Next.js 14 (App Router) |
| Animations | Framer Motion 11 |
| Styling | Tailwind CSS + CSS variables |
| Font | Poppins (Google Fonts) |
| Simulation Engine | Custom mean-reverting random walk (TypeScript, in-browser) |

---

## Project Structure

```
/
├── perp-dex/            ← Rust backend (matching engine + HTTP + WebSocket API)
│   ├── src/
│   │   ├── main.rs          ← Server bootstrap, market maker, engine/funding/liquidation tasks
│   │   ├── handlers.rs      ← REST endpoint handlers
│   │   ├── orderbook.rs     ← Core orderbook data structure
│   │   ├── matching.rs      ← Order matching logic
│   │   ├── position.rs      ← Position tracking and P&L
│   │   ├── liquidation.rs   ← Liquidation logic
│   │   ├── funding.rs       ← Funding rate calculation
│   │   ├── events.rs        ← Event type definitions
│   │   ├── eventsourcing.rs ← WAL + snapshot persistence
│   │   ├── snapshot.rs      ← Snapshot serialisation
│   │   └── websocket.rs     ← WebSocket handler
│   └── Cargo.toml
│
└── perp-dex-client/     ← Next.js frontend (trading UI)
    ├── app/
    │   ├── page.tsx             ← TradingView root — layout, state routing
    │   ├── hooks/
    │   │   ├── useSimulation.ts ← In-browser price engine + order execution
    │   │   ├── useOrderbook.ts  ← WebSocket client with reconnection
    │   │   └── usePhantom.ts    ← Phantom wallet integration
    │   ├── components/
    │   │   ├── TopBar.tsx
    │   │   ├── PriceChart.tsx
    │   │   ├── Orderbook.tsx
    │   │   ├── OrderForm.tsx
    │   │   ├── PositionPanel.tsx
    │   │   ├── RecentTrades.tsx
    │   │   ├── TradeHistory.tsx
    │   │   └── FundingRate.tsx
    │   └── lib/
    │       └── simulation.ts    ← Price walk, synthetic orderbook, order executor
    └── package.json
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Rust** >= 1.80 (only if running the backend)

---

### Option A — Frontend Only (Simulation Mode)

The frontend is **fully functional without the Rust backend**. It runs a built-in simulation engine.

```bash
cd perp-dex-client
npm install
npm run dev
```

Open **http://localhost:3000**. The status indicator in the top-right will show **SIM**.

---

### Option B — Full Stack (Frontend + Rust Backend)

#### 1. Start the Rust backend

```bash
cd perp-dex

# Install Rust if needed:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Build and run:
cargo build --release
cargo run --release
```

The backend starts on **http://localhost:8080**. You should see:

```
[server] listening on http://0.0.0.0:8080
```

#### 2. Start the Next.js frontend (new terminal)

```bash
cd perp-dex-client
npm install
npm run dev
```

Open **http://localhost:3000**. The status indicator will show **LIVE** once the WebSocket connects.

---

## Environment Variables

Both services work with zero config by default. Override only if needed.

### Frontend — `perp-dex-client/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

To point to a remote backend:

```bash
echo "NEXT_PUBLIC_API_URL=http://your-server:8080" > perp-dex-client/.env.local
echo "NEXT_PUBLIC_WS_URL=ws://your-server:8080" >> perp-dex-client/.env.local
```

---

## How to Use the Demo

You start with a **$500 demo balance**.

### Placing an Order

1. Select **▲ LONG** (Buy) or **▼ SHORT** (Sell) in the right panel
2. Choose **Market** (fills immediately) or **Limit** (resting order)
3. Set your **size** (contracts) and **leverage** (1× – 50×)
4. Click the submit button — required margin is shown before you confirm

### Managing Your Position

- The **Position** tab shows live unrealised P&L, margin ratio, and liquidation price
- The **margin health bar** turns yellow then red as you approach liquidation
- Click **Close Position** to market-close your entire position

### Liquidation

If the mark price moves against you and your **margin ratio falls to 5%**, your position is force-closed. A full-screen liquidation animation fires and your margin is forfeited.

### Trade History

Switch to the **History** tab to see all past fills with realised P&L.

### Reset

Click **RESET** in the top bar to restore your $500 balance and clear all positions and history.

---

## Backend API Reference

### REST Endpoints

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/order` | `{ side, qty, price?, margin }` | Place an order |
| `DELETE` | `/order/:id` | `{ price, side }` | Cancel a limit order |
| `GET` | `/orderbook` | — | Top-20 depth snapshot |
| `GET` | `/position/:user_id` | — | Position + unrealised P&L |
| `GET` | `/funding-rate` | — | Current funding rate |
| `POST` | `/snapshot/save` | — | Persist state to disk |
| `POST` | `/snapshot/load` | — | Restore state from disk |

### WebSocket

Connect to `ws://localhost:8080/ws/orderbook`.

**Orderbook update:**

```json
{
  "type": "orderbook",
  "symbol": "BTC-PERP",
  "bids": [{ "price": 64998, "qty": 15 }],
  "asks": [{ "price": 65001, "qty": 8 }],
  "best_bid": 64998,
  "best_ask": 65001,
  "mark_price": 65000,
  "index_price": 64950
}
```

**Trades update:**

```json
{
  "type": "trades",
  "trades": [{ "taker": "...", "maker": "...", "price": 65000, "qty": 3 }]
}
```

### Example — Place a Long

```bash
curl -X POST http://localhost:8080/order \
  -H 'Content-Type: application/json' \
  -d '{ "side": "Buy", "qty": 5, "price": 65000, "margin": 100.0 }'
```

---

## Architecture Deep Dive

### Simulation Engine (Frontend)

Located in `app/lib/simulation.ts` and `app/hooks/useSimulation.ts`.

The price engine runs a mean-reverting random walk:

```
mark[t+1] = mark[t] + shock + drift
shock      = U(-1,1) × volatility × mark[t]
drift      = (basePrice - mark[t]) / basePrice × 0.00003 × mark[t]
```

The index price lags the mark with 5% smoothing + small noise, producing a realistic funding rate. A synthetic orderbook is rebuilt every ~900ms around the mark price with randomised depth.

### Order Execution (Simulation)

`executeOrder()` handles four scenarios:

- **New position** — deducts margin from balance
- **Add to existing position** — VWAP blended entry price
- **Reduce/close opposing position** — releases margin + records realised P&L
- **Position flip** — closes existing side, opens opposite with remainder

### Liquidation Formula

```
margin_ratio = (margin + unrealisedPnl) / (size × markPrice)
```

When `margin_ratio ≤ 0.05` (5% maintenance margin), the position is force-closed, margin is forfeited, and the trade is recorded in history with a negative P&L.

### Market Maker (Backend)

The Rust backend runs an internal market maker loop every 400ms that:

1. Cancels all previous MM resting orders
2. Nudges the mark price ±0.05% using an xorshift64 PRNG
3. Places 12 fresh bid and ask levels with randomised spread and quantity
4. Broadcasts the updated orderbook to all connected WebSocket clients

This keeps the book alive and price moving without any external feed.

### WebSocket Reconnection

`useOrderbook.ts` connects to `ws://localhost:8080/ws/orderbook`. On disconnect, it retries up to 8 times with 3-second intervals. The UI shows **SIM** when disconnected and **LIVE** when connected, switching data sources automatically.

---

## All Commands Reference

### Rust Backend

```bash
# Install / update Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Development run (with logging)
cd perp-dex
RUST_LOG=info cargo run

# Production build
cargo build --release
./target/release/perp-dex

# Run tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Compile check (no binary)
cargo check
```

### Next.js Frontend

```bash
cd perp-dex-client

# Install dependencies
npm install

# Development server (hot reload)
npm run dev

# Production build
npm run build
npm start

# TypeScript type check
npx tsc --noEmit
```

---

## Simulation Mode vs Live Mode

| | Simulation Mode | Live Mode |
|---|---|---|
| Price source | Mean-reverting random walk | Rust market maker (backend) |
| Orderbook | Synthetic, rebuilt every ~900ms | Real-time WebSocket stream |
| Order execution | In-browser TypeScript engine | Rust matching engine |
| Status indicator | **SIM** | **LIVE** |
| Backend required | No | Yes (`localhost:8080`) |

---

## License

Built for the contest. All rights reserved.
