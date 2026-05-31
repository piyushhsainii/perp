"use client";

/**
 * usePhantom.ts
 *
 * Detects Phantom wallet, handles connect/disconnect,
 * and persists connection intent across page reloads.
 *
 * Fixes applied:
 *  1. SSR guard — window access is safe on Vercel (no server-side crash)
 *  2. Mobile deep-link — opens site inside Phantom in-app browser on mobile
 *  3. installed starts as null (unknown) so UI can avoid flash of wrong state
 */

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export interface UsePhantomReturn {
  installed: boolean | null; // null = not yet checked (SSR / first paint)
  connected: boolean;
  publicKey: string | null;  // base58 wallet address
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  shortAddress: string | null; // e.g. "4xKz…9mRt"
}

// Your production frontend URL — used for the Phantom mobile deep-link
const PROD_URL = "https://perp.vercel.app";

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePhantom(): UsePhantomReturn {
  // null  = we haven't checked yet (server render or first paint)
  // false = checked, Phantom not installed
  // true  = checked, Phantom installed
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Detect Phantom on mount + auto-reconnect if previously trusted
  useEffect(() => {
    // SSR guard — window doesn't exist during Vercel server render
    if (typeof window === "undefined") return;

    const provider = window.solana;

    if (!provider?.isPhantom) {
      setInstalled(false);
      return;
    }

    setInstalled(true);

    // If already connected from a previous session, pick it up immediately
    if (provider.publicKey) {
      setConnected(true);
      setPublicKey(provider.publicKey.toString());
      return;
    }

    // Silent reconnect — won't show a popup if user previously approved
    provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        setConnected(true);
        setPublicKey(publicKey.toString());
      })
      .catch(() => {
        // Not previously trusted — fine, wait for manual connect
      });

    // ── Wallet event listeners ───────────────────────────────────────────────

    const onConnect = () => {
      if (provider.publicKey) {
        setConnected(true);
        setPublicKey(provider.publicKey.toString());
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      setPublicKey(null);
    };

    const onAccountChange = () => {
      if (provider.publicKey) {
        setPublicKey(provider.publicKey.toString());
      } else {
        setConnected(false);
        setPublicKey(null);
      }
    };

    provider.on("connect", onConnect);
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChange);

    return () => {
      provider.off("connect", onConnect);
      provider.off("disconnect", onDisconnect);
      provider.off("accountChanged", onAccountChange);
    };
  }, []);

  // ── connect ─────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    // SSR guard
    if (typeof window === "undefined") return;

    const provider = window.solana;

    if (!provider?.isPhantom) {
      if (isMobileBrowser()) {
        // On mobile, Phantom isn't a browser extension — the user needs to
        // open this site inside the Phantom in-app browser instead.
        window.open(
          `https://phantom.app/ul/browse/${encodeURIComponent(PROD_URL)}`,
          "_blank",
        );
      } else {
        // Desktop — send to install page
        window.open("https://phantom.app/", "_blank");
      }
      return;
    }

    setConnecting(true);
    try {
      const { publicKey } = await provider.connect();
      setConnected(true);
      setPublicKey(publicKey.toString());
    } catch {
      // User rejected the connection prompt — do nothing
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── disconnect ──────────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    // SSR guard
    if (typeof window === "undefined") return;

    await window.solana?.disconnect();
    setConnected(false);
    setPublicKey(null);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const shortAddress = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  return {
    installed,
    connected,
    publicKey,
    connecting,
    connect,
    disconnect,
    shortAddress,
  };
}