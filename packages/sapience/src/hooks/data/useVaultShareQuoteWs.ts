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
  const lastValidQuoteRef = useRef<VaultShareWsQuote | null>(null);
  const { apiBaseUrl } = useSettings();

  const wsUrl = useMemo(() => {
    if (!chainId || !vaultAddress) {
      return null;
    }
    const url = toAuctionWsUrl(apiBaseUrl);
    if (url) {
      try {
        const u = new URL(url);
        u.searchParams.set('v', '1');
        const finalUrl = u.toString();
        return finalUrl;
      } catch {
        return url;
      }
    }
    return null;
  }, [apiBaseUrl, chainId, vaultAddress]);

  useEffect(() => {
    if (!wsUrl || !chainId || !vaultAddress) {
      return;
    }
    let closed = false;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Restore last valid quote if available to prevent flashing to 0
    if (lastValidQuoteRef.current) {
      setQuote(lastValidQuoteRef.current);
    }

    ws.onopen = () => {
      try {
        const message = {
          type: 'vault_quote.subscribe',
          payload: { chainId, vaultAddress },
        };
        ws.send(JSON.stringify(message));
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[VaultWS] Error sending message:', error);
        }
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Message received:', data);
        }
        if (data?.type === 'vault_quote.update' && data?.payload) {
          const p = data.payload as VaultShareWsQuotePayload;
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[VaultWS] Vault quote received:', {
              chainId: p.chainId,
              vaultAddress: p.vaultAddress,
              vaultCollateralPerShare: p.vaultCollateralPerShare,
              timestamp: p.timestamp,
              signedBy: p.signedBy,
              hasSignature: !!p.signature,
            });
          }
          if (
            p.chainId === chainId &&
            p.vaultAddress?.toLowerCase() === vaultAddress.toLowerCase()
          ) {
            const newQuote = {
              vaultCollateralPerShare: String(p.vaultCollateralPerShare),
              updatedAtMs: p.timestamp,
              source: 'ws' as const,
              raw: p,
            };
            // Store as last valid quote if it's not '0'
            if (
              p.vaultCollateralPerShare &&
              p.vaultCollateralPerShare !== '0'
            ) {
              lastValidQuoteRef.current = newQuote;
            }
            setQuote(newQuote);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[VaultWS] Error parsing message:', error);
        }
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
