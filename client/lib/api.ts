import type {
  OrderbookData,
  PlaceOrderRequest,
  PlaceOrderResponse,
  FundingData,
  Position,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export function placeOrder(body: PlaceOrderRequest) {
  // Backend expects qty as u32 — floor to nearest integer
  return request<PlaceOrderResponse>("/order", {
    method: "POST",
    body: JSON.stringify({ ...body, qty: Math.max(1, Math.floor(body.qty)) }),
  });
}

export function cancelOrder(id: string, price: number, side: "Buy" | "Sell") {
  return request<{ cancelled: boolean }>(`/order/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ price, side }),
  });
}

// ─── Orderbook ────────────────────────────────────────────────────────────────

export function getOrderbook() {
  return request<OrderbookData>("/orderbook");
}

// ─── Positions ────────────────────────────────────────────────────────────────

export function getPosition(userId: string) {
  return request<Position>(`/position/${userId}`);
}

// ─── Funding ──────────────────────────────────────────────────────────────────

export function getFundingRate() {
  return request<FundingData>("/funding-rate");
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export function saveSnapshot() {
  return request<{ saved: boolean }>("/snapshot/save", { method: "POST" });
}

export function loadSnapshot() {
  return request<{ loaded: boolean }>("/snapshot/load", { method: "POST" });
}
