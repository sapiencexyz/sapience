'use client';

/**
 * CommitmentStatus — lifecycle state indicator for a commitment.
 *
 * Renders a status badge/message based on the current commitment state:
 *   signing, committing, waiting_quotes, selecting, executing, executed, expired, error.
 */

import type { CommitmentState } from '~/lib/context/CommitmentContext';

interface CommitmentStatusProps {
  state: CommitmentState;
  error?: string | null;
  /** Seconds remaining in T1 (predictor-exclusive window). */
  t1Remaining?: number;
}

const STATE_LABELS: Record<CommitmentState, string> = {
  idle: '',
  signing: 'Signing commitment...',
  committing: 'Submitting on-chain...',
  waiting_quotes: 'Waiting for counterparty quotes...',
  selecting: 'Quotes available — select and execute',
  executing: 'Executing...',
  executed: 'Commitment executed successfully',
  expired: 'No valid quotes received. Escrow refunded.',
  error: 'Error',
};

const STATE_COLORS: Record<CommitmentState, string> = {
  idle: '',
  signing: 'text-yellow-400',
  committing: 'text-yellow-400',
  waiting_quotes: 'text-blue-400',
  selecting: 'text-green-400',
  executing: 'text-yellow-400',
  executed: 'text-green-500',
  expired: 'text-gray-400',
  error: 'text-red-500',
};

export function CommitmentStatus({
  state,
  error,
  t1Remaining,
}: CommitmentStatusProps) {
  if (state === 'idle') return null;

  const isSpinner =
    state === 'signing' || state === 'committing' || state === 'executing';

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-2 text-sm ${STATE_COLORS[state]}`}>
        {isSpinner && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        <span>{state === 'error' && error ? error : STATE_LABELS[state]}</span>
      </div>

      {(state === 'waiting_quotes' || state === 'selecting') &&
        t1Remaining !== undefined &&
        t1Remaining > 0 && (
          <div className="text-xs text-gray-500">
            Predictor window: {t1Remaining}s remaining
          </div>
        )}

      {state === 'expired' && (
        <div className="text-xs text-gray-500">
          Your escrowed collateral will be returned to your wallet.
        </div>
      )}

      {state === 'executed' && (
        <div className="text-xs text-green-600">
          Position minted. Check your portfolio for details.
        </div>
      )}
    </div>
  );
}
