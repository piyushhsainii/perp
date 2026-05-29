//! WebSocket handler — upgrades HTTP connections and fans out orderbook
//! updates to all connected clients via a `tokio::broadcast` channel.

use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use tokio::sync::broadcast;

use crate::orderbook::Match;
use crate::AppState;

pub async fn ws_orderbook(
    req:   HttpRequest,
    body:  web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, body)?;

    let mut rx = state.broadcast_tx.subscribe();

    actix_web::rt::spawn(async move {
        loop {
            tokio::select! {
                Ok(msg) = rx.recv() => {
                    if session.text(msg).await.is_err() { break; }
                }
                Some(Ok(msg)) = msg_stream.recv() => {
                    match msg {
                        Message::Ping(bytes) => {
                            if session.pong(&bytes).await.is_err() { break; }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
                else => break,
            }
        }
        let _ = session.close(None).await;
    });

    Ok(response)
}

pub fn serialize_orderbook_update(state: &AppState) -> String {
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

    serde_json::to_string(&serde_json::json!({
        "type":     "orderbook",
        "symbol":   ob.symbol,
        "bids":     bids,
        "asks":     asks,
        "best_bid": ob.get_best_bid(),
        "best_ask": ob.get_best_ask(),
    }))
    .unwrap_or_default()
}

pub fn broadcast_trades(
    broadcast_tx: &broadcast::Sender<String>,
    matches:      &[Match],
) {
    if matches.is_empty() { return; }
    let payload = serde_json::to_string(&serde_json::json!({
        "type":   "trades",
        "trades": matches,
    }))
    .unwrap_or_default();
    let _ = broadcast_tx.send(payload);
}