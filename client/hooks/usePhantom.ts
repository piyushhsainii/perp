"use client";

/**
 * usePhantom.ts
 *
 * Detects Phantom wallet, handles connect/disconnect,
 * and persists connection intent across page reloads.
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
  installed: boolean; // is Phantom browser extension present?
  connected: boolean;
  publicKey: string | null; // base58 wallet address
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  shortAddress: string | null; // e.g. "4xKz…9mRt"
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePhantom(): UsePhantomReturn {
  const [installed, setInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Detect Phantom on mount + auto-reconnect if previously trusted
  useEffect(() => {
    const provider = window.solana;
    if (!provider?.isPhantom) return;

    setInstalled(true);

    // If already connected from a previous session, silently reconnect
    if (provider.publicKey) {
      setConnected(true);
      setPublicKey(provider.publicKey.toString());
      return;
    }

    // Try silent reconnect (onlyIfTrusted = don't show popup)
    provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        setConnected(true);
        setPublicKey(publicKey.toString());
      })
      .catch(() => {
        /* not previously trusted — that's fine */
      });

    // Listen for wallet events
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

  const connect = useCallback(async () => {
    const provider = window.solana;
    if (!provider?.isPhantom) {
      // Open Phantom install page if not installed
      window.open("https://phantom.app/", "_blank");
      return;
    }
    setConnecting(true);
    try {
      const { publicKey } = await provider.connect();
      setConnected(true);
      setPublicKey(publicKey.toString());
    } catch {
      // User rejected
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await window.solana?.disconnect();
    setConnected(false);
    setPublicKey(null);
  }, []);

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
