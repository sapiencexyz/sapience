import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useSettings } from '../../lib/context/SettingsContext';
import { toAuctionWsUrl } from '../../lib/ws';
import { getSharedAuctionWsClient } from '../../lib/ws/AuctionWsClient';

interface VaultShareWsQuotePayload {
  chainId: number;
  vaultAddress: string;
  vaultCollateralPerShare: string; // decimal string
  timestamp: number; // ms
  signedBy?: string;
  signature?: string;
}

interface VaultShareWsQuote {
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
  const lastValidQuoteRef = useRef<VaultShareWsQuote | null>(null);
  const { apiBaseUrl } = useSettings();

  const wsUrl = useMemo(() => {
    if (!chainId || !vaultAddress) {
      return null;
    }
    return toAuctionWsUrl(apiBaseUrl);
  }, [apiBaseUrl, chainId, vaultAddress]);

  useEffect(() => {
    if (!wsUrl || !chainId || !vaultAddress) {
      return;
    }

    const client = getSharedAuctionWsClient(wsUrl);

    // Restore last valid quote if available to prevent flashing to 0
    if (lastValidQuoteRef.current) {
      setQuote(lastValidQuoteRef.current);
    }

    // Send subscription message
    const sendSubscribe = () => {
      try {
        const message = {
          type: 'vault_quote.subscribe',
          payload: { chainId, vaultAddress },
        };
        client.send(message);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Subscribed to vault quote:', {
            chainId,
            vaultAddress,
          });
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[VaultWS] Error sending subscribe message:', error);
        }
      }
    };

    // Subscribe immediately (shared client queues if not connected yet)
    sendSubscribe();

    // Handle incoming messages
    const handleMessage = (msg: unknown) => {
      try {
        const data = msg as {
          type?: string;
          payload?: VaultShareWsQuotePayload;
        };
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Message received:', data);
        }
        if (data?.type === 'vault_quote.update' && data?.payload) {
          const p = data.payload;
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

    // Handle reconnection - resubscribe when connection reopens
    const handleOpen = () => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultWS] Connection opened, resubscribing');
      }
      sendSubscribe();
    };

    const offMessage = client.addMessageListener(handleMessage);
    const offOpen = client.addOpenListener(handleOpen);

    return () => {
      offMessage();
      offOpen();
      // Send unsubscribe message on cleanup
      try {
        client.send({
          type: 'vault_quote.unsubscribe',
          payload: { chainId, vaultAddress },
        });
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultWS] Unsubscribed from vault quote');
        }
      } catch {
        /* noop */
      }
    };
  }, [wsUrl, chainId, vaultAddress]);

  return quote;
}
