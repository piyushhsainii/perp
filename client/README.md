# PERP/DEX — Full Stack Perpetual Futures Engine

> Production-architecture perpetual futures exchange.
> Rust matching engine + Next.js trading UI with live simulation.

---

## One-command startup (after installing deps)

```bash
# Terminal 1 — backend
cd perp-dex && cargo run --release

# Terminal 2 — frontend
cd perp-dex-client && npm install && npm run dev
```

Then open **http://localhost:3000**.

---

## What's included

```
perp-dex/            ← Rust backend
perp-dex-client/     ← Next.js frontend
README.md            ← This file
```

### Backend features
- BTreeMap price-level orderbook with O(log n) matching
- Limit + market orders, partial fills, VWAP position averaging
- Funding rate calculation and 8-hour periodic application
- Margin ratio monitoring, auto-liquidation, insurance fund
- Auto-Deleveraging (ADL) ranked by PnL × leverage
- Event sourcing: JSONL write-ahead log + periodic JSON snapshots
- Crash recovery: load snapshot → replay events idempotently
- Actix-web HTTP REST API + tokio::broadcast WebSocket fan-out

### Frontend features
- **Self-contained simulation** — works with zero backend
- Random walk price engine (mean-reverting, ~0.09% vol/tick)
- Synthetic orderbook rebuilt every tick
- Live Framer Motion orderbook (rows slide in/out, depth bars animate)
- SVG price chart with animated path + spring-physics price dot
- Order form: market/limit, leverage 1×–50×, margin preview
- $500 demo balance, full position management, liquidation
- Trade history with realised PnL per trade
- Automatic fallback: **SIM** mode → **LIVE** when backend connects

---

See `perp-dex/README.md` and `perp-dex-client/README.md` for full docs.
