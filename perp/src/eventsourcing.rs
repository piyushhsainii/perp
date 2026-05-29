//! Event sourcing persistence layer.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use anyhow::Result;

use crate::events::OrderbookEvent;
use crate::orderbook::Orderbook;
use crate::snapshot::OrderbookSnapshot;

const SNAPSHOT_PATH: &str = "snapshot.json";
const EVENT_LOG_PATH: &str = "events.jsonl";

pub fn persist_snapshot(snap: &OrderbookSnapshot) -> Result<()> {
    let json = serde_json::to_string_pretty(snap)?;
    fs::write(SNAPSHOT_PATH, json)?;
    log::info!("[snapshot] saved at event_index={}", snap.last_event_index);
    Ok(())
}

pub fn load_latest_snapshot() -> Result<Option<OrderbookSnapshot>> {
    if !std::path::Path::new(SNAPSHOT_PATH).exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(SNAPSHOT_PATH)?;
    let snap: OrderbookSnapshot = serde_json::from_str(&json)?;
    log::info!("[snapshot] loaded at event_index={}", snap.last_event_index);
    Ok(Some(snap))
}

pub fn append_event(event: &OrderbookEvent) -> Result<()> {
    let line = serde_json::to_string(event)? + "\n";
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(EVENT_LOG_PATH)?;
    file.write_all(line.as_bytes())?;
    Ok(())
}

pub fn load_events_since(since_index: u32) -> Result<Vec<OrderbookEvent>> {
    if !std::path::Path::new(EVENT_LOG_PATH).exists() {
        return Ok(vec![]);
    }
    let file = fs::File::open(EVENT_LOG_PATH)?;
    let reader = BufReader::new(file);
    let events: Vec<OrderbookEvent> = reader
        .lines()
        .enumerate()
        .filter(|(i, _)| *i as u32 >= since_index)
        .filter_map(|(_, line)| {
            line.ok().and_then(|l| serde_json::from_str(&l).ok())
        })
        .collect();
    Ok(events)
}

pub fn recover(ob: &mut Orderbook) -> Result<()> {
    let (snap, since) = match load_latest_snapshot()? {
        Some(s) => {
            let since = s.last_event_index;
            (s, since)
        }
        None => {
            log::info!("[recovery] no snapshot found — starting fresh");
            return Ok(());
        }
    };

    let events = load_events_since(since)?;
    log::info!("[recovery] replaying {} events from index {}", events.len(), since);
    ob.replay_from(snap, events);
    Ok(())
}