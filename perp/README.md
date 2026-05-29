# Perpetual DEX Engine

A production-grade perpetual futures matching engine written in Rust, exposing HTTP and WebSocket APIs. Implements order matching, position management, funding rates, liquidations, auto-deleveraging (ADL), and crash recovery via event sourcing — mirroring the core architecture of exchanges like Hyperliquid, Drift, and dYdX.

---

## Requirements

- **Rust 1.80+** (install or update via `rustup update stable`)
- No external services required for development — the event log and snapshot use local JSON files

---

## Quick Start

```bash
git clone <repo>
cd perp-dex
cargo build --release
cargo run --release
```

The server starts on `http://0.0.0.0:8080`.

Run tests:
```bash
cargo test
```

---

## File Structure

```
perp-dex/
├── Cargo.toml                    # Dependencies and build config
└── src/
    ├── main.rs                   # Entry point: server, queue wiring, background tasks
    ├── lib.rs                    # Module declarations (re-exported for tests)
    │
    ├── models/                   # Pure data types — no I/O, no async
    │   ├── mod.rs
    │   ├── orderbook.rs          # ★ Core: Orderbook struct + all matching/position logic
    │   ├── position.rs           # Position, PositionSide, Side enums + PnL formulas
    │   ├── events.rs             # OrderbookEvent enum (every mutation is an event)
    │   └── snapshot.rs           # OrderbookSnapshot struct for persistence
    │
    ├── engine/                   # Business logic that operates on models
    │   ├── mod.rs
    │   ├── matching.rs           # Convenience wrappers + match validation helpers
    │   ├── funding.rs            # Funding rate calculation and periodic application
    │   ├── liquidation.rs        # Liquidation scanner + ADL orchestration
    │   └── eventsourcing.rs      # Snapshot and event-log persistence + crash recovery
    │
    └── api/                      # Network layer — no business logic here
        ├── mod.rs
        ├── handlers.rs           # All Actix-web HTTP handlers (REST endpoints)
        └── websocket.rs          # WebSocket upgrade, broadcast, orderbook serialisation
```

---

## Architecture

### Request Flow

```
HTTP Client
    │
    ▼
Actix-web Handler (handlers.rs)
    │  validates input, builds OrderbookEvent
    ▼
tokio::mpsc Channel  (capacity: 10,000)
    │  decouples ingestion from processing
    ▼
Engine Loop (main.rs: spawn_engine_loop)
    │  single consumer — no locks on hot path
    ├─► apply_event_idempotent()  → mutates Orderbook
    ├─► append_event()            → write-ahead log (events.jsonl)
    ├─► persist_snapshot()        → every 100 events (snapshot.json)
    └─► broadcast_tx.send()       → fan-out to all WS clients

WebSocket Clients ◄── tokio::broadcast (capacity: 1,024)
```

### Why Single-Threaded Engine Loop?

The matching engine processes one event at a time from the mpsc channel. This eliminates race conditions without needing locks around the `Orderbook` — the `Mutex` is only acquired for brief read-only HTTP responses (orderbook depth, position queries). This is the same model used by Redis and many high-frequency trading systems.

---

## Key Components

### `models/orderbook.rs` — The Core

The `Orderbook` struct is the entire state machine. Key design choices:

- **`BTreeMap<u32, Bid/Ask>`** — keeps price levels sorted automatically. Best bid is `bids.keys().next_back()`, best ask is `asks.keys().next()`. O(log n) insertion and lookup.
- **`create_order()`** — walks the opposing side's price levels from best price inward, filling each resting order until the incoming quantity is exhausted or the book runs out. Partial fills leave a remainder on the book for limit orders; market order remainders are reported as `left_qty`.
- **`open_position()`** — uses volume-weighted average entry price (VWAP) when adding to an existing position, and handles position flipping (long → short) atomically.
- **`apply_event()` / `apply_event_idempotent()`** — every state mutation goes through these. `apply_event` is purely deterministic (no I/O, no side effects). `apply_event_idempotent` checks a `HashSet<Uuid>` of seen event IDs before delegating, preventing double-execution on replay.

### `models/position.rs` — Formulas

All financial formulas in one place:

| Function | Formula |
|---|---|
| `unrealized_pnl` | Long: `(mark − entry) × size` · Short: `(entry − mark) × size` |
| `margin_ratio` | `(margin + upnl) / (size × mark_price)` |
| `leverage` | `(size × entry_price) / margin` |
| `liquidation_price` | Long: `(margin − entry×size) / (mm×size − size)` · Short: `(margin + entry×size) / (size×(1+mm))` |
| `adl_rank` | `unrealized_pnl × leverage` |

### `models/events.rs` — Event Types

Every mutation is one of:

| Event | Trigger |
|---|---|
| `OrderPlaced` | HTTP `POST /order` |
| `OrderCancelled` | HTTP `DELETE /order/:id` |
| `OrderMatched` | Produced inside `create_order` |
| `FundingApplied` | Background task every 8 hours |
| `Liquidated` | Liquidation scanner every 5 seconds |
| `Adl` | After insurance fund exhausted |

### `engine/eventsourcing.rs` — Crash Recovery

On startup, `recover()`:
1. Loads `snapshot.json` (state at event N)
2. Reads `events.jsonl` from line N onward
3. Replays each event via `apply_event_idempotent` (safe to re-run)

This means the engine can crash at any point and lose zero trades on restart.

### `engine/liquidation.rs` — Liquidation + ADL

`check_and_liquidate()` scans all positions and liquidates any where `margin_ratio ≤ maintenance_margin`. Losses are absorbed by the insurance fund. If the fund is depleted, `run_adl()` in `orderbook.rs` ranks all opposing positions by `pnl × leverage` and force-closes the most profitable ones until the shortfall is covered.

---

## HTTP API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/order` | Place limit or market order |
| `DELETE` | `/order/:id` | Cancel a resting limit order |
| `GET` | `/orderbook` | Top-20 bids and asks |
| `GET` | `/position/:user_id` | Position, PnL, margin ratio, liq price |
| `GET` | `/funding-rate` | Current funding rate + mark/index prices |
| `POST` | `/snapshot/save` | Trigger manual snapshot to disk |
| `POST` | `/snapshot/load` | Restore state from latest snapshot |

### Example: Place a Limit Buy

```bash
curl -X POST http://localhost:8080/order \
  -H 'Content-Type: application/json' \
  -d '{
    "side": "Buy",
    "qty": 10,
    "price": 65000,
    "margin": 500.0
  }'
```

### Example: Place a Market Sell

```bash
curl -X POST http://localhost:8080/order \
  -H 'Content-Type: application/json' \
  -d '{
    "side": "Sell",
    "qty": 5,
    "margin": 250.0
  }'
```

---

## WebSocket

Connect to `ws://localhost:8080/ws/orderbook`. After every engine event you receive:

```json
{
  "type": "orderbook",
  "symbol": "BTC-PERP",
  "bids": [{ "price": 64998, "qty": 15 }, ...],
  "asks": [{ "price": 65001, "qty": 8  }, ...],
  "best_bid": 64998,
  "best_ask": 65001
}
```

---

## Configuration

Configuration is currently via constants in `main.rs`. For production, replace these with environment variables or a config file:

| Constant | Default | Description |
|---|---|---|
| `bind_addr` | `0.0.0.0:8080` | Server bind address |
| `maintenance_margin` | `0.05` (5%) | Liquidation threshold |
| `taker_fee` | `0.0006` (0.06%) | Taker fee rate |
| `maker_fee` | `-0.0001` (−0.01%) | Maker rebate rate |
| `insurance_fund` | `10,000` | Starting insurance fund balance |
| Auto-snapshot interval | Every 100 events | Snapshots in engine loop |
| Funding interval | 8 hours | Background task interval |
| Liquidation scan | Every 5 seconds | Background task interval |

---

## Production Upgrades

The architecture is designed so these can be swapped in without touching business logic:

| Dev (current) | Production replacement |
|---|---|
| `tokio::mpsc` | Redis Streams (`XADD` / `XREAD`) |
| `snapshot.json` | PostgreSQL / Redis |
| `events.jsonl` | Kafka / Redis Streams |
| In-process broadcast | Redis Pub/Sub |
| Hardcoded mark price | Chainlink / Pyth oracle feed |

---

## Running Tests

```bash
cargo test
```

The test suite in `models/orderbook.rs` and `engine/` covers:

- Full limit order matching (buy hits ask, sell hits bid)
- Partial fills with book remainder
- Market order illiquid remainder
- Order cancellation
- Funding rate formula and direction (longs pay, shorts receive)
- Liquidation removes position and reduces insurance fund
- ADL ranking and partial close
- Position averaging (VWAP entry price)
- Snapshot round-trip (save → load → state preserved)
- Idempotent replay (same event applied twice has no double effect)
- Liquidation price is below entry for longs, above for shorts
