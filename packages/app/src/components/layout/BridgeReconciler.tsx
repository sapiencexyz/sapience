'use client';

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useQueries } from '@tanstack/react-query';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  describeBungeeStatus,
  fetchBungeeStatus,
  isBungeeSuccess,
  isBungeeTerminal,
} from '~/lib/bungee';
import { pruneStale } from '~/lib/bridgeTracker';
import { useBridgeTracker } from '~/hooks/useBridgeTracker';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';

const STATUS_POLL_MS = 5_000;
const REMOVE_GRACE_MS = 30_000;

/**
 * Top-level Bungee bridge reconciler. Owns the status poll for every
 * persisted in-flight bridge so it survives dialog close + page reload,
 * fires a toast + balance refetch on terminal status, and prunes the
 * record after a short grace so an open dialog can show the success
 * state before the row vanishes. Renders nothing.
 */
export default function BridgeReconciler() {
  const { address: eoaAddress } = useAccount();
  const { smartAccountAddress } = useSession();
  const { toast } = useToast();
  const { bridges, removeBridge } = useBridgeTracker();

  // Drop stale (>24h) records once at mount and whenever the EOA changes,
  // so we don't keep polling hashes Bungee has already forgotten about.
  useEffect(() => {
    if (eoaAddress) pruneStale(eoaAddress);
  }, [eoaAddress]);

  const { refetch: refetchEoaBalance } = useCollateralBalance({
    address: eoaAddress,
    chainId: DEFAULT_CHAIN_ID,
  });
  const { refetch: refetchSmartAccountBalance } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(smartAccountAddress),
  });

  // One status query per persisted record. Same query key as the panel's
  // history rows, so the cache is shared and we don't double-poll.
  const statusQueries = useQueries({
    queries: bridges.map((b) => ({
      queryKey: ['bungee-status', b.requestHash],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchBungeeStatus(b.requestHash, signal),
      refetchInterval: (query: {
        state: { data?: { result?: Array<{ bungeeStatusCode: number }> } };
      }) => {
        const code = query.state.data?.result?.[0]?.bungeeStatusCode;
        return isBungeeTerminal(code) ? false : STATUS_POLL_MS;
      },
      retry: 1,
    })),
  });

  // Track which hashes we've already finalised so we don't toast twice.
  // Persists across renders for the lifetime of this component (i.e.
  // until full page reload).
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bridges.forEach((bridge, idx) => {
      const code = statusQueries[idx]?.data?.result?.[0]?.bungeeStatusCode;
      if (!isBungeeTerminal(code)) return;
      if (handledRef.current.has(bridge.requestHash)) return;
      handledRef.current.add(bridge.requestHash);

      const recipientLabel =
        bridge.recipient === 'smartAccount'
          ? 'Sapience Account'
          : 'Ethereal Account';

      if (isBungeeSuccess(code)) {
        toast({
          title: 'Bridge complete',
          description: `Funds delivered to your ${recipientLabel}.`,
          duration: 6000,
        });
        refetchEoaBalance();
        refetchSmartAccountBalance();
      } else {
        const refundHash =
          statusQueries[idx]?.data?.result?.[0]?.refund?.txHash;
        toast({
          title: 'Bridge failed',
          description: refundHash
            ? `${describeBungeeStatus(code)} — refund processed to your wallet.`
            : `${describeBungeeStatus(code)}.`,
          variant: 'destructive',
          duration: 8000,
        });
      }

      const hash = bridge.requestHash;
      window.setTimeout(() => removeBridge(hash), REMOVE_GRACE_MS);
    });
  }, [
    bridges,
    statusQueries,
    toast,
    refetchEoaBalance,
    refetchSmartAccountBalance,
    removeBridge,
  ]);

  return null;
}
