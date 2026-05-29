//! Actix-web HTTP handlers for all REST endpoints.

use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::events::OrderbookEvent;
use crate::position::Side;
use crate::AppState;

#[derive(Deserialize)]
pub struct PlaceOrderRequest {
    pub user_id: Option<Uuid>,
    pub side:    Side,
    pub qty:     u32,
    pub price:   Option<u32>,
    pub margin:  f64,
}

#[derive(Serialize)]
pub struct PlaceOrderResponse {
    pub event_id:          Uuid,
    pub original_order_id: Uuid,
    pub queued:            bool,
}

#[derive(Deserialize)]
pub struct CancelOrderRequest {
    pub price: u32,
    pub side:  Side,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

fn bad_request(msg: impl Into<String>) -> HttpResponse {
    HttpResponse::BadRequest().json(ErrorResponse { error: msg.into() })
}

pub async fn place_order(
    state: web::Data<AppState>,
    body:  web::Json<PlaceOrderRequest>,
) -> impl Responder {
    if body.qty == 0 {
        return bad_request("qty must be > 0");
    }
    if body.margin < 0.0 {
        return bad_request("margin must be >= 0");
    }

    let event_id          = Uuid::new_v4();
    let original_order_id = Uuid::new_v4();
    let user_id           = body.user_id.unwrap_or_else(Uuid::new_v4);

    let event = OrderbookEvent::OrderPlaced {
        event_id,
        user_id,
        original_order_id,
        side:   body.side.clone(),
        qty:    body.qty,
        price:  body.price,
        margin: body.margin,
    };

    match state.tx.send(event).await {
        Ok(_)  => HttpResponse::Ok().json(PlaceOrderResponse {
            event_id,
            original_order_id,
            queued: true,
        }),
        Err(e) => bad_request(format!("queue error: {e}")),
    }
}

pub async fn cancel_order(
    state: web::Data<AppState>,
    path:  web::Path<Uuid>,
    body:  web::Json<CancelOrderRequest>,
) -> impl Responder {
    let order_id = path.into_inner();
    let event = OrderbookEvent::OrderCancelled {
        event_id: Uuid::new_v4(),
        order_id,
        price:    body.price,
        side:     body.side.clone(),
    };

    match state.tx.send(event).await {
        Ok(_)  => HttpResponse::Ok().json(serde_json::json!({ "cancelled": true })),
        Err(e) => bad_request(format!("queue error: {e}")),
    }
}

pub async fn get_orderbook(state: web::Data<AppState>) -> impl Responder {
    let ob = state.orderbook.lock().unwrap();

    let asks: Vec<_> = ob.asks.iter()
        .take(20)
        .map(|(price, level)| serde_json::json!({ "price": price, "qty": level.total_qty }))
        .collect();

    let bids: Vec<_> = ob.bids.iter()
        .rev()
        .take(20)
        .map(|(price, level)| serde_json::json!({ "price": price, "qty": level.total_qty }))
        .collect();

    HttpResponse::Ok().json(serde_json::json!({
        "symbol":    ob.symbol,
        "bids":      bids,
        "asks":      asks,
        "best_bid":  ob.get_best_bid(),
        "best_ask":  ob.get_best_ask(),
        "mid_price": ob.mid_price(),
        "spread":    ob.spread(),
    }))
}

pub async fn get_position(
    state: web::Data<AppState>,
    path:  web::Path<Uuid>,
) -> impl Responder {
    let user_id = path.into_inner();
    let ob = state.orderbook.lock().unwrap();

    match ob.positions.get(&user_id) {
        Some(pos) => {
            let upnl      = pos.unrealized_pnl(ob.mark_price);
            let ratio     = pos.margin_ratio(ob.mark_price);
            let liq_price = pos.liquidation_price(ob.maintenance_margin);
            HttpResponse::Ok().json(serde_json::json!({
                "user_id":        user_id,
                "side":           pos.side,
                "size":           pos.size,
                "entry_price":    pos.entry_price,
                "margin":         pos.margin,
                "unrealized_pnl": upnl,
                "margin_ratio":   ratio,
                "liq_price":      liq_price,
                "leverage":       pos.leverage(),
            }))
        }
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: format!("no position for user {user_id}"),
        }),
    }
}

pub async fn get_funding_rate(state: web::Data<AppState>) -> impl Responder {
    let ob = state.orderbook.lock().unwrap();
    let rate = ob.calculate_funding_rate();
    HttpResponse::Ok().json(serde_json::json!({
        "funding_rate": rate,
        "mark_price":   ob.mark_price,
        "index_price":  ob.index_price,
    }))
}

pub async fn save_snapshot(state: web::Data<AppState>) -> impl Responder {
    let ob   = state.orderbook.lock().unwrap();
    let snap = ob.save_snapshot();
    drop(ob);

    match crate::eventsourcing::persist_snapshot(&snap) {
        Ok(_)  => HttpResponse::Ok().json(serde_json::json!({ "saved": true })),
        Err(e) => bad_request(format!("snapshot error: {e}")),
    }
}

pub async fn load_snapshot_handler(state: web::Data<AppState>) -> impl Responder {
    match crate::eventsourcing::load_latest_snapshot() {
        Ok(Some(snap)) => {
            let mut ob = state.orderbook.lock().unwrap();
            ob.load_snapshot(snap);
            HttpResponse::Ok().json(serde_json::json!({ "loaded": true }))
        }
        Ok(None) => bad_request("no snapshot found on disk"),
        Err(e)   => bad_request(format!("snapshot error: {e}")),
    }
}