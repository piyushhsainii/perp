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
use position::Position;

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

    let orderbook = Arc::new(Mutex::new(raw_ob));

    let state = AppState {
        orderbook:    Arc::clone(&orderbook),
        tx:           tx.clone(),
        broadcast_tx: broadcast_tx.clone(),
    };

    spawn_engine_loop(rx, Arc::clone(&orderbook), broadcast_tx.clone());
    spawn_funding_task(tx.clone());
    spawn_liquidation_task(Arc::clone(&orderbook), tx.clone());

    let bind_addr = "0.0.0.0:8080";
    log::info!("[server] listening on http://{bind_addr}");

    let app_state = web::Data::new(state);

    HttpServer::new(move || {
        // Allow requests from the Next.js dev server and any localhost port.
        // In production replace the origin list with your actual domain.
        let cors = Cors::default()
            .allowed_origin("http://localhost:3000")
            .allowed_origin("http://127.0.0.1:3000")
            .allowed_origin_fn(|origin, _req| {
                // Allow any localhost origin (handles :3001, :3002, etc.)
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
                    "type":     "orderbook",
                    "symbol":   ob.symbol,
                    "bids":     bids,
                    "asks":     asks,
                    "best_bid": ob.get_best_bid(),
                    "best_ask": ob.get_best_ask(),
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
                    .filter(|(_id, pos): &(&Uuid, &Position)| {
                        pos.margin_ratio(mark) <= mm
                    })
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