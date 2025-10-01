import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useSettings } from '../../lib/context/SettingsContext';
import { toAuctionWsUrl } from '../../lib/ws';

export interface VaultShareWsQuotePayload {
  chainId: number;
  vaultAddress: string;
  vaultCollateralPerShare: string; // decimal string
  timestamp: number; // ms
  signedBy?: string;
  signature?: string;
}

export interface VaultShareWsQuote {
  vaultCollateralPerShare: string; // decimal string
  updatedAtMs: number;
  source: 'ws' | 'fallback';
  raw?: VaultShareWsQuotePayload;
}

interface UseVaultShareQuoteWsOptions {
  chainId?: number;
  vaultAddress?: Address;
}

export function useVaultShareQuoteWs(
  options: UseVaultShareQuoteWsOptions
): VaultShareWsQuote {
  const { chainId, vaultAddress } = options;
  const [quote, setQuote] = useState<VaultShareWsQuote>({
    vaultCollateralPerShare: '0',
    updatedAtMs: Date.now(),
    source: 'fallback',
  });
  const wsRef = useRef<WebSocket | null>(null);
  const { apiBaseUrl } = useSettings();

  const wsUrl = useMemo(() => {
    if (!chainId || !vaultAddress) return null;
    const url = toAuctionWsUrl(apiBaseUrl);
    if (url) {
      try {
        const u = new URL(url);
        u.searchParams.set('v', '1');
        return u.toString();
      } catch {
        return url;
      }
    }
    return null;
  }, [apiBaseUrl, chainId, vaultAddress]);

  useEffect(() => {
    if (!wsUrl || !chainId || !vaultAddress) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultWS] Skipping connect', {
          hasUrl: !!wsUrl,
          chainId,
          vaultAddress: vaultAddress ? String(vaultAddress) : null,
        });
      }
      return;
    }
    let closed = false;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultWS] Connected', {
          url: wsUrl,
          chainId,
          vaultAddress: String(vaultAddress),
        });
      }
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Sending subscribe', {
            chainId,
            vaultAddress: String(vaultAddress),
          });
        }
        ws.send(
          JSON.stringify({
            type: 'vault_quote.subscribe',
            payload: { chainId, vaultAddress },
          })
        );
      } catch {
        /* noop */
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Message', data);
        }
        if (data?.type === 'vault_quote.update' && data?.payload) {
          const p = data.payload as VaultShareWsQuotePayload;
          if (
            p.chainId === chainId &&
            p.vaultAddress?.toLowerCase() === vaultAddress.toLowerCase()
          ) {
            setQuote({
              vaultCollateralPerShare: String(p.vaultCollateralPerShare),
              updatedAtMs: p.timestamp,
              source: 'ws',
              raw: p,
            });
          }
        }
      } catch {
        /* noop */
      }
    };
    ws.onerror = (e) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultWS] Error', e);
      }
      // keep fallback
    };
    ws.onclose = (ev) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultWS] Closed', { code: ev.code, reason: ev.reason });
      }
      if (!closed) {
        // keep fallback
      }
    };

    return () => {
      closed = true;
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Disposing socket');
        }
        ws.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
  }, [wsUrl, chainId, vaultAddress]);

  return quote;
}
