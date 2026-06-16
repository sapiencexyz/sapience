import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import {
  fetchSponsorStatus,
  type SponsorStatusResponse,
} from '../lib/backendApi';

/** Reads the player's on-chain sponsorship state (keyed by smart account).
 *  Drives "skip Fund" + the "Mint with sponsorship balance" button. Mirrors
 *  /app's useSponsorStatus, but bingo reads it from its own backend. */
export function useSponsorStatus(player?: Address): {
  status: SponsorStatusResponse | null;
  eligible: boolean;
  loading: boolean;
  refetch: () => void;
} {
  const [status, setStatus] = useState<SponsorStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!player) {
      setStatus(null);
      return;
    }
    let stop = false;
    setLoading(true);
    fetchSponsorStatus(player)
      .then((s) => {
        if (!stop) setStatus(s);
      })
      .catch(() => {
        if (!stop) setStatus(null);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [player, nonce]);

  return {
    status,
    eligible: status?.eligible ?? false,
    loading,
    refetch: () => setNonce((n) => n + 1),
  };
}
