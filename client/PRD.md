# Perpetual DEX — Full Stack

A production-architecture perpetual futures exchange simulation.

- **Backend** — Rust matching engine (Actix-web, tokio, event sourcing)
- **Frontend** — Next.js 14 trading UI (Framer Motion, Tailwind, Poppins)

The client runs a fully self-contained simulation with a random price walk and a live synthetic orderbook. When the Rust backend is running, the client automatically connects via WebSocket and switches to live data.

---

## Project Structure

```
/
├── perp-dex/            ← Rust backend (matching engine + HTTP + WebSocket API)
└── perp-dex-client/     ← Next.js frontend (trading UI)
```

---

## Quick Start — Run Both Together

### 1. Clone / unzip the project

```bash
# If in a single zip, unzip it first:
unzip perp-dex-full.zip && cd perp-dex-full
```

### 2. Start the Rust backend

```bash
cd perp-dex

# Install Rust if needed (requires >= 1.80):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Build and run:
cargo build --release
cargo run --release
```

The backend starts on **http://localhost:8080**.

You should see:

```
[server] listening on http://0.0.0.0:8080
```

### 3. Start the Next.js client (new terminal)

```bash
cd perp-dex-client
npm install
npm run dev
```

The frontend starts on **http://localhost:3000**.

Open your browser at **http://localhost:3000**.

---

## Environment Variables

Both services work with zero config by default. Override if needed:

### Frontend (`perp-dex-client/.env.local`)

```bash
# Where the Rust backend HTTP API lives
NEXT_PUBLIC_API_URL=http://localhost:8080

# Where the Rust backend WebSocket lives
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

Create this file if you need to point to a remote backend:

```bash
echo "NEXT_PUBLIC_API_URL=http://your-server:8080" > perp-dex-client/.env.local
echo "NEXT_PUBLIC_WS_URL=ws://your-server:8080" >> perp-dex-client/.env.local
```

---

## Running Without the Backend (Simulation Mode)

The frontend is **fully functional without the Rust backend**. It runs a built-in simulation:

- Random walk price engine (mean-reverting, ~0.09% vol per tick)
- Synthetic orderbook regenerated every ~900ms
- Simulated funding rate derived from mark/index divergence
- Full order execution, position management, and liquidation in-browser

The status indicator in the top-right shows **SIM** when offline and **LIVE** when connected to the backend.

---

## How to Use the Demo

### You start with **$500 demo balance**.

#### Place an order

1. Select **▲ LONG** (Buy) or **▼ SHORT** (Sell) in the right panel
2. Choose **Market** (fills at current price) or **Limit** (resting order)
3. Set your **size** (contracts) and **leverage** (1× – 50×)
4. Click the green/red submit button

The required margin is shown before you submit. If you have insufficient balance, an error appears.

#### Manage your position

- The **Position** tab shows your live P&L, margin ratio, and liquidation price
- The **margin health bar** turns yellow then red as you approach liquidation
- Click **Close Position** to market-close your entire position

#### Liquidation

If the mark price moves against you and your **margin ratio falls to 5%**, your position is liquidated automatically. A full-screen animation fires and your margin is forfeited.

#### View trade history

Switch to the **History** tab to see all your past fills with realised P&L.

#### Reset

Click **RESET** in the top bar to restore your $500 balance and wipe all positions/history.

---

## Backend API Reference

### REST

| Method   | Endpoint             | Body                            | Description          |
| -------- | -------------------- | ------------------------------- | -------------------- |
| `POST`   | `/order`             | `{ side, qty, price?, margin }` | Place order          |
| `DELETE` | `/order/:id`         | `{ price, side }`               | Cancel limit order   |
| `GET`    | `/orderbook`         | —                               | Top-20 depth         |
| `GET`    | `/position/:user_id` | —                               | Position + PnL       |
| `GET`    | `/funding-rate`      | —                               | Current funding rate |
| `POST`   | `/snapshot/save`     | —                               | Save state to disk   |
| `POST`   | `/snapshot/load`     | —                               | Restore from disk    |

### WebSocket

Connect to `ws://localhost:8080/ws/orderbook`.

Messages received:

```json
{
  "type": "orderbook",
  "symbol": "BTC-PERP",
  "bids": [{ "price": 64998, "qty": 15 }],
  "asks": [{ "price": 65001, "qty": 8 }],
  "best_bid": 64998,
  "best_ask": 65001
}
```

```json
{
  "type": "trades",
  "trades": [{ "taker": "...", "maker": "...", "price": 65000, "qty": 3 }]
}
```

### Example: Place a Long

```bash
curl -X POST http://localhost:8080/order \
  -H 'Content-Type: application/json' \
  -d '{ "side": "Buy", "qty": 5, "price": 65000, "margin": 100.0 }'
```

---

## All Commands Reference

### Rust Backend

```bash
# Install / update Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Development (with logging)
cd perp-dex
RUST_LOG=info cargo run

# Production build
cargo build --release
./target/release/perp-dex

# Run tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Check compilation without building
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

# Type check
npx tsc --noEmit
```

---

## Architecture Notes

### Simulation engine (frontend-only)

Located in `perp-dex-client/app/lib/simulation.ts` and `app/hooks/useSimulation.ts`.

The price engine runs a mean-reverting random walk:

```
mark[t+1] = mark[t] + shock + drift
shock     = U(-1,1) × volatility × mark[t]
drift     = (65000 - mark[t]) / 65000 × 0.00003 × mark[t]
```

The index price lags the mark with 5% smoothing + small noise, producing a realistic funding rate.

A synthetic orderbook is rebuilt every tick around the mark price with random depth at each level.

### Order execution (simulation)

`executeOrder()` in `simulation.ts` handles:

- Opening a fresh position (deducts margin from balance)
- Adding to an existing same-side position (VWAP entry price)
- Reducing / closing an opposing position (releases margin + realised PnL)
- Flipping a position (close then open opposite side with remainder)

### Liquidation

Every price tick, the `marginRatio` formula is evaluated:

```
margin_ratio = (margin + unrealisedPnl) / (size × markPrice)
```

When this falls to ≤ 5% (the `maintenance_margin`), the position is forcibly closed. The margin is forfeited, and the trade is recorded in history with a negative PnL.

### Connection fallback

`useOrderbook.ts` connects to `ws://localhost:8080/ws/orderbook`. If the connection is closed or fails, it reconnects after 3 seconds using exponential backoff. The page displays **SIM** when disconnected and uses the simulation orderbook, automatically switching to **LIVE** orderbook data when the backend is available.

---

## Tech Stack

| Layer              | Technology                                         |
| ------------------ | -------------------------------------------------- |
| Matching engine    | Rust, Actix-web 4, tokio                           |
| State persistence  | Event sourcing (JSONL event log + JSON snapshots)  |
| Real-time API      | WebSocket via actix-ws + tokio::broadcast          |
| Frontend framework | Next.js 14 (App Router)                            |
| Animations         | Framer Motion 11                                   |
| Styling            | Tailwind CSS + CSS variables                       |
| Font               | Poppins (Google Fonts)                             |
| Simulation         | Custom random walk engine (TypeScript, in-browser) |
