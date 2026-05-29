import type {
  PlaceOrderRequest,
  PlaceOrderResponse,
  FundingData,
  Position,
} from "./types";

const BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Orders ────────────────────────────────────────────────────────────────────
export function placeOrder(body: PlaceOrderRequest & { market?: string }) {
  // Pass market both in body AND as query param for maximum compatibility
  const market = body.market ?? "BTC-PERP";
  return request<PlaceOrderResponse>(
    `/order?market=${encodeURIComponent(market)}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function cancelOrder(
  id: string,
  price: number,
  side: "Buy" | "Sell",
  market = "BTC-PERP",
) {
  return request<{ cancelled: boolean }>(
    `/order/${id}?market=${encodeURIComponent(market)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ price, side }),
    },
  );
}

// ── Orderbook ─────────────────────────────────────────────────────────────────
export function getOrderbook(market = "BTC-PERP") {
  return request<{
    symbol: string;
    bids: { price: number; qty: number }[];
    asks: { price: number; qty: number }[];
    best_bid: number | null;
    best_ask: number | null;
    mark_price: number;
    index_price: number;
    funding_rate: number;
  }>(`/orderbook?market=${encodeURIComponent(market)}`);
}

// ── Positions ─────────────────────────────────────────────────────────────────
export function getPosition(userId: string, market = "BTC-PERP") {
  return request<Position>(
    `/position/${userId}?market=${encodeURIComponent(market)}`,
  );
}

// ── Funding ───────────────────────────────────────────────────────────────────
export function getFundingRate(market = "BTC-PERP") {
  return request<FundingData>(
    `/funding-rate?market=${encodeURIComponent(market)}`,
  );
}

// ── All mark prices (for multi-market ticker) ─────────────────────────────────
export function getAllMarkPrices(): Promise<
  Record<
    string,
    {
      mark_price: number;
      index_price: number;
      funding_rate: number;
      best_bid: number | null;
      best_ask: number | null;
    }
  >
> {
  return request("/mark-price");
}

// ── Snapshots ─────────────────────────────────────────────────────────────────
export function saveSnapshot(market = "BTC-PERP") {
  return request<{ saved: boolean }>(
    `/snapshot/save?market=${encodeURIComponent(market)}`,
    { method: "POST" },
  );
}

export function loadSnapshot(market = "BTC-PERP") {
  return request<{ loaded: boolean }>(
    `/snapshot/load?market=${encodeURIComponent(market)}`,
    { method: "POST" },
  );
}
