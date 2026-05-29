import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import {
  submitCard,
  type LineProgress,
  type LineStatus,
  type SubmitCardResult,
} from '~/lib/submitCard';
import { useSession } from './useSession';
import { buildLines } from '~/parlay';

export interface SubmitCardArgs {
  /** On-chain card id. */
  cardId: bigint;
  /** The card's 16 cell conditionIds + matching resolvers (cell order). */
  conditionIds: readonly Hex[];
  resolvers: readonly Address[];
  /** Declared sides bitmask: bit i = YES on cell i. */
  cellSides: number;
  /** The card's stamped price in wei; each line stakes price / 10. */
  cardPriceWei: bigint;
  /** BingoCard address — the predictor's mint sponsor. */
  bingoCardAddress: Address;
}

export function useSubmitCard() {
  const { client: sessionClient, isActive, config } = useSession();
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
    async (args: SubmitCardArgs) => {
      if (!isActive || !sessionClient || !config) {
        throw new Error('Session not active');
      }
      setIsSubmitting(true);
      setError(null);
      setResult(null);
      try {
        // 10 lines split the card price evenly; each line stakes price / 10.
        const stakePerLineWei = args.cardPriceWei / 10n;
        const r = await submitCard({
          sessionClient,
          smartAccountAddress: config.smartAccountAddress,
          cardId: args.cardId,
          conditionIds: args.conditionIds,
          resolvers: args.resolvers,
          cellSides: args.cellSides,
          stakePerLineWei,
          bingoCardAddress: args.bingoCardAddress,
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
    [isActive, sessionClient, config],
  );

  return { submit, progress, result, isSubmitting, error };
}
