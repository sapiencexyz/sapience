import { useCallback, useState } from 'react';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import {
  submitCard,
  type LineProgress,
  type LineStatus,
  type SubmitCardResult,
} from '~/lib/submitCard';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { useSession } from './useSession';
import type { BingoCondition } from '~/api';
import type { Side } from '~/screens/CardScreen';
import type { Tier } from '~/App';
import { buildLines } from '~/parlay';

export function useSubmitCard() {
  const { address: eoa } = useAccount();
  const { client: sessionClient, isActive } = useSession();
  const [progress, setProgress] = useState<Record<string, LineProgress>>(() =>
    Object.fromEntries(
      buildLines().map((l) => [
        l.id,
        { lineId: l.id, status: 'pending' as LineStatus },
      ]),
    ),
  );
  const [result, setResult] = useState<SubmitCardResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (tier: Tier, conditions: BingoCondition[], picks: Side[]) => {
      if (!eoa) throw new Error('Wallet not connected');
      if (!isActive || !sessionClient) {
        throw new Error('Session not active');
      }
      setIsSubmitting(true);
      setError(null);
      setResult(null);
      try {
        // 10 lines split the tier evenly: allowance covers the full tier,
        // each line stakes tier/10. (Cells are just the picks display;
        // the on-chain stake is per-line, not per-cell.)
        const stakePerLineWei = parseUnits(String(tier / 10), 18);
        const sa = computeSmartAccountAddress(eoa);
        const r = await submitCard({
          sessionClient,
          smartAccountAddress: sa,
          conditions,
          picks,
          stakePerLineWei,
          onProgress: (lineId, status, extra) => {
            setProgress((prev) => ({
              ...prev,
              [lineId]: { ...prev[lineId], status, ...extra },
            }));
          },
        });
        setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [eoa, isActive, sessionClient],
  );

  return { submit, progress, result, isSubmitting, error };
}
