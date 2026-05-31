mod events;
mod eventsourcing;
mod funding;
mod handlers;
mod liquidation;
mod matching;
mod orderbook;
mod position;
mod snapshot;
mod websocket;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use actix_cors::Cors;
use actix_web::{http, middleware, web, App, HttpServer};
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use events::OrderbookEvent;
use orderbook::{Match, Orderbook};
use position::{Position, Side};

#[derive(Clone)]
pub struct AppState {
    pub orderbook:    Arc<Mutex<Orderbook>>,
    pub tx:           mpsc::Sender<OrderbookEvent>,
    pub broadcast_tx: broadcast::Sender<String>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info"),
    )
    .init();

    let (tx, rx)          = mpsc::channel::<OrderbookEvent>(10_000);
    let (broadcast_tx, _) = broadcast::channel::<String>(1_024);

    let mut raw_ob = Orderbook::new("BTC-PERP");

    if let Err(e) = eventsourcing::recover(&mut raw_ob) {
        log::warn!("[startup] recovery failed (first run?): {e}");
    }

    raw_ob.mark_price  = 65_000;
    raw_ob.index_price = 64_900;

    // Seed initial resting orders so book isn't empty
    for i in 0..20u32 {
        let offset = (i + 1) * 10;
        raw_ob.create_order(Uuid::new_v4(), Side::Buy,  5 + i * 2, Some(65_000 - offset), 0.0);
        raw_ob.create_order(Uuid::new_v4(), Side::Sell, 5 + i * 2, Some(65_000 + offset), 0.0);
    }

    let orderbook = Arc::new(Mutex::new(raw_ob));

    let state = AppState {
        orderbook:    Arc::clone(&orderbook),
        tx:           tx.clone(),
        broadcast_tx: broadcast_tx.clone(),
    };

    spawn_engine_loop(rx, Arc::clone(&orderbook), broadcast_tx.clone());
    spawn_funding_task(tx.clone());
    spawn_liquidation_task(Arc::clone(&orderbook), tx.clone());
    spawn_market_maker(Arc::clone(&orderbook), broadcast_tx.clone());

    let bind_addr = "0.0.0.0:8080";
    log::info!("[server] listening on http://{bind_addr}");

    let app_state = web::Data::new(state);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:3000")
            .allowed_origin("http://127.0.0.1:3000")
            .allowed_origin_fn(|origin, _req| {
                origin.as_bytes().starts_with(b"http://localhost:")
                    || origin.as_bytes().starts_with(b"http://127.0.0.1:")
            })
            .allowed_methods(vec!["GET", "POST", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                http::header::CONTENT_TYPE,
                http::header::AUTHORIZATION,
                http::header::ACCEPT,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .route("/order",         web::post()  .to(handlers::place_order))
            .route("/order/{id}",    web::delete().to(handlers::cancel_order))
            .route("/orderbook",     web::get()   .to(handlers::get_orderbook))
            .route("/position/{id}", web::get()   .to(handlers::get_position))
            .route("/funding-rate",  web::get()   .to(handlers::get_funding_rate))
            .route("/snapshot/save", web::post()  .to(handlers::save_snapshot))
            .route("/snapshot/load", web::post()  .to(handlers::load_snapshot_handler))
            .route("/ws/orderbook",  web::get()   .to(websocket::ws_orderbook))
    })
    .bind(bind_addr)?
    .run()
    .await
}

// ─── Market maker ─────────────────────────────────────────────────────────────
//
// Every 400 ms:
//   1. Walk the current book and cancel all MM-owned resting orders.
//   2. Read the current mark price (mid of best bid/ask).
//   3. Place fresh bids and asks with randomised qty and slight spread jitter.
//   4. Broadcast the updated book to all WS clients.
//
// This gives a constantly-moving book with realistic depth without needing
// external price feeds.

fn spawn_market_maker(
    orderbook:    Arc<Mutex<Orderbook>>,
    broadcast_tx: broadcast::Sender<String>,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(400));

        // Track the UUIDs of MM orders so we can cancel them each cycle.
        let mut mm_bid_ids: Vec<(Uuid, u32)> = Vec::new(); // (order_id, price)
        let mut mm_ask_ids: Vec<(Uuid, u32)> = Vec::new();

        // Tiny PRNG state for fast no-dependency randomness
        let mut rng_state: u64 = 0xdeadbeef_cafebabe;

        let mut fast_rand = move || -> f64 {
            // xorshift64
            rng_state ^= rng_state << 13;
            rng_state ^= rng_state >> 7;
            rng_state ^= rng_state << 17;
            (rng_state >> 11) as f64 / (u64::MAX >> 11) as f64
        };

        loop {
            interval.tick().await;

            // ── 1. Cancel previous MM orders ────────────────────────────────
            {
                let mut ob = orderbook.lock().unwrap();
                for (oid, price) in mm_bid_ids.drain(..) {
                    ob.cancel_order(oid, price, Side::Buy);
                }
                for (oid, price) in mm_ask_ids.drain(..) {
                    ob.cancel_order(oid, price, Side::Sell);
                }
            }

            // ── 2. Determine mid price ───────────────────────────────────────
            let mid: u32 = {
                let ob = orderbook.lock().unwrap();
                match (ob.get_best_bid(), ob.get_best_ask()) {
                    (Some(b), Some(a)) => (b + a) / 2,
                    _ => ob.mark_price,
                }
            };

            if mid == 0 { continue; }

            // ── 3. Place fresh MM orders ─────────────────────────────────────
            //
            // Spread: 5–25 ticks on each side.
            // Depth:  12 levels, qty 1–30 contracts per level.
            // Slight random walk on mid to simulate price movement.
            {
                let mut ob = orderbook.lock().unwrap();

                // Nudge mark price slightly each cycle (±0.05 %)
                let drift = (fast_rand() - 0.5) * 0.001 * mid as f64;
                let new_mark = (mid as f64 + drift).max(1.0).round() as u32;
                ob.mark_price  = new_mark;
                ob.index_price = new_mark.saturating_sub(50 + (fast_rand() * 100.0) as u32);

                let base_spread: u32 = 5 + (fast_rand() * 20.0) as u32;

                for i in 0..12u32 {
                    let jitter   = (fast_rand() * 8.0) as u32;
                    let bid_px   = new_mark.saturating_sub(base_spread + i * 12 + jitter);
                    let ask_px   = new_mark + base_spread + i * 12 + jitter;
                    let qty: u32 = 1 + (fast_rand() * 29.0) as u32;

                    // Place bid
                    let bid_oid = Uuid::new_v4();
                    // Inject directly into book levels (bypass event log for MM orders)
                    let bid_level = ob.bids.entry(bid_px).or_insert(orderbook::Bid {
                        total_qty: 0,
                        orders: Vec::new(),
                    });
                    bid_level.total_qty += qty;
                    bid_level.orders.push(orderbook::OpenOrder {
                        user_id:           bid_oid,
                        qty,
                        filled_qty:        0,
                        original_order_id: bid_oid,
                    });
                    mm_bid_ids.push((bid_oid, bid_px));

                    // Place ask
                    let ask_oid = Uuid::new_v4();
                    let ask_level = ob.asks.entry(ask_px).or_insert(orderbook::Ask {
                        total_qty: 0,
                        orders: Vec::new(),
                    });
                    ask_level.total_qty += qty;
                    ask_level.orders.push(orderbook::OpenOrder {
                        user_id:           ask_oid,
                        qty,
                        filled_qty:        0,
                        original_order_id: ask_oid,
                    });
                    mm_ask_ids.push((ask_oid, ask_px));
                }
            }

            // ── 4. Broadcast updated book ────────────────────────────────────
            {
                let ob = orderbook.lock().unwrap();

                let bids: Vec<serde_json::Value> = ob.bids.iter()
                    .rev().take(20)
                    .map(|(p, l)| serde_json::json!({ "price": p, "qty": l.total_qty }))
                    .collect();

                let asks: Vec<serde_json::Value> = ob.asks.iter()
                    .take(20)
                    .map(|(p, l)| serde_json::json!({ "price": p, "qty": l.total_qty }))
                    .collect();

                let payload = serde_json::to_string(&serde_json::json!({
                    "type":        "orderbook",
                    "symbol":      ob.symbol,
                    "bids":        bids,
                    "asks":        asks,
                    "best_bid":    ob.get_best_bid(),
                    "best_ask":    ob.get_best_ask(),
                    "mark_price":  ob.mark_price,
                    "index_price": ob.index_price,
                }))
                .unwrap_or_default();

                drop(ob);
                let _ = broadcast_tx.send(payload);
            }
        }
    });
}

// ─── Engine loop ──────────────────────────────────────────────────────────────

fn spawn_engine_loop(
    mut rx:       mpsc::Receiver<OrderbookEvent>,
    orderbook:    Arc<Mutex<Orderbook>>,
    broadcast_tx: broadcast::Sender<String>,
) {
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Err(e) = eventsourcing::append_event(&event) {
                log::error!("[engine] WAL append failed: {e}");
            }

            let needs_snapshot: bool = {
                let mut ob = orderbook.lock().unwrap();
                ob.apply_event_idempotent(event);
                ob.last_event_index % 100 == 0
            };

            if needs_snapshot {
                let snap = orderbook.lock().unwrap().save_snapshot();
                if let Err(e) = eventsourcing::persist_snapshot(&snap) {
                    log::error!("[engine] snapshot failed: {e}");
                }
            }

            // Broadcast after user-placed order
            {
                let ob = orderbook.lock().unwrap();

                let bids: Vec<serde_json::Value> = ob.bids.iter()
                    .rev().take(20)
                    .map(|(p, l)| serde_json::json!({ "price": p, "qty": l.total_qty }))
                    .collect();

                let asks: Vec<serde_json::Value> = ob.asks.iter()
                    .take(20)
                    .map(|(p, l)| serde_json::json!({ "price": p, "qty": l.total_qty }))
                    .collect();

                let payload = serde_json::to_string(&serde_json::json!({
                    "type":        "orderbook",
                    "symbol":      ob.symbol,
                    "bids":        bids,
                    "asks":        asks,
                    "best_bid":    ob.get_best_bid(),
                    "best_ask":    ob.get_best_ask(),
                    "mark_price":  ob.mark_price,
                    "index_price": ob.index_price,
                }))
                .unwrap_or_default();

                drop(ob);
                let _ = broadcast_tx.send(payload);

                let empty: Vec<Match> = Vec::new();
                websocket::broadcast_trades(&broadcast_tx, &empty);
            }
        }
    });
}

// ─── Funding task ─────────────────────────────────────────────────────────────

fn spawn_funding_task(tx: mpsc::Sender<OrderbookEvent>) {
    tokio::spawn(async move {
        let tx: mpsc::Sender<OrderbookEvent> = tx;
        let mut interval = tokio::time::interval(Duration::from_secs(8 * 3_600));
        interval.tick().await;
        loop {
            interval.tick().await;
            let mark_price:  u32 = 65_000;
            let index_price: u32 = 64_900;
            let event = OrderbookEvent::FundingApplied {
                event_id: Uuid::new_v4(),
                mark_price,
                index_price,
            };
            if tx.send(event).await.is_err() {
                log::error!("[funding] engine queue closed");
                break;
            }
            log::info!("[funding] applied mark={mark_price} index={index_price}");
        }
    });
}

// ─── Liquidation task ─────────────────────────────────────────────────────────

fn spawn_liquidation_task(
    orderbook: Arc<Mutex<Orderbook>>,
    tx:        mpsc::Sender<OrderbookEvent>,
) {
    tokio::spawn(async move {
        let tx: mpsc::Sender<OrderbookEvent> = tx;
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            let candidates: Vec<(Uuid, u32)> = {
                let ob   = orderbook.lock().unwrap();
                let mark = ob.mark_price;
                let mm   = ob.maintenance_margin;
                ob.positions
                    .iter()
                    .filter(|(_id, pos): &(&Uuid, &Position)| pos.margin_ratio(mark) <= mm)
                    .map(|(&id, _)| (id, mark))
                    .collect()
            };
            for (user_id, mark_price) in candidates {
                let event = OrderbookEvent::Liquidated {
                    event_id: Uuid::new_v4(),
                    user_id,
                    mark_price,
                };
                if tx.send(event).await.is_err() {
                    log::error!("[liquidation] engine queue closed");
                    return;
                }
                log::warn!("[liquidation] queued liquidation for user={user_id}");
            }
        }
    });
}