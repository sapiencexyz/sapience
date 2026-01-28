'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Badge } from '@sapience/ui/components/ui/badge';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { useSession } from '~/lib/context/SessionContext';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import {
  useV2Predictions,
  useV2PredictionsCount,
  useV2PositionBalances,
  type V2Prediction,
  type V2PositionBalance,
} from '~/hooks/graphql/useV2Positions';
import { useV2Write } from '~/hooks/blockchain/useV2Write';
import { useV2PickConfiguration, useV2ClaimableAmount } from '~/hooks/blockchain/useV2Contract';

// Settlement result display
const SETTLEMENT_RESULT_LABELS: Record<string, { label: string; variant: 'default' | 'success' | 'destructive' | 'secondary' }> = {
  UNRESOLVED: { label: 'Pending', variant: 'secondary' },
  PREDICTOR_WINS: { label: 'Predictor Wins', variant: 'success' },
  COUNTERPARTY_WINS: { label: 'Counterparty Wins', variant: 'success' },
  NON_DECISIVE: { label: 'Non-Decisive', variant: 'default' },
};

function SettlementBadge({ result }: { result: string }) {
  const config = SETTLEMENT_RESULT_LABELS[result] || SETTLEMENT_RESULT_LABELS.UNRESOLVED;
  return (
    <Badge variant={config.variant as any}>
      {config.label}
    </Badge>
  );
}

function EndsInDisplay({ endsAtSec }: { endsAtSec: number | null | undefined }) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!endsAtSec) {
    return <span className="text-muted-foreground">—</span>;
  }

  const endsAtMs = endsAtSec * 1000;
  const isPast = endsAtMs <= nowMs;

  if (isPast) {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500">
        Awaiting Settlement
      </Badge>
    );
  }

  const settlesAt = new Date(endsAtMs);
  const label = formatDistanceToNowStrict(settlesAt, { roundingMethod: 'round' });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help">
            {`Ends in ${label}`}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div>{settlesAt.toLocaleString()}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function V2PositionRow({
  position,
  isPredictor,
  collateralSymbol,
  effectiveAddress,
  onSettle,
  onRedeem,
  isSettling,
  isRedeeming,
}: {
  position: V2PositionBalance;
  isPredictor: boolean;
  collateralSymbol: string;
  effectiveAddress: string | null;
  onSettle: (pickConfigId: string) => void;
  onRedeem: (tokenAddress: string, amount: bigint) => void;
  isSettling: boolean;
  isRedeeming: boolean;
}) {
  const pickConfig = position.pickConfig;
  const isResolved = pickConfig?.resolved ?? false;
  const result = pickConfig?.result ?? 'UNRESOLVED';

  // Determine if this position is a winner
  const isWinner = isResolved && (
    (isPredictor && result === 'PREDICTOR_WINS') ||
    (!isPredictor && result === 'COUNTERPARTY_WINS') ||
    result === 'NON_DECISIVE'
  );

  // Get claimable amount
  const { claimableAmount } = useV2ClaimableAmount({
    pickConfigId: pickConfig?.id as `0x${string}`,
    tokenAddress: position.tokenAddress as Address,
    amount: BigInt(position.balance),
    chainId: position.chainId,
    enabled: isResolved && BigInt(position.balance) > 0n,
  });

  const balanceFormatted = parseFloat(formatEther(BigInt(position.balance)));
  const claimableFormatted = claimableAmount ? parseFloat(formatEther(claimableAmount)) : 0;

  // Build picks display
  const picksDisplay = pickConfig?.picks?.map((pick, idx) => {
    const outcomeLabel = pick.predictedOutcome === 0 ? 'YES' : 'NO';
    const questionText = pick.condition?.shortName || pick.condition?.question || pick.conditionId.slice(0, 10);
    return (
      <div key={idx} className="text-xs">
        <span className="text-muted-foreground">{questionText}:</span>{' '}
        <span className={pick.predictedOutcome === 0 ? 'text-emerald-500' : 'text-red-500'}>
          {outcomeLabel}
        </span>
      </div>
    );
  });

  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          {picksDisplay}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={isPredictor ? 'default' : 'secondary'}>
          {isPredictor ? 'Predictor' : 'Counterparty'}
        </Badge>
      </TableCell>
      <TableCell>
        <NumberDisplay value={balanceFormatted} appendedText={collateralSymbol} />
      </TableCell>
      <TableCell>
        <SettlementBadge result={result} />
      </TableCell>
      <TableCell>
        <EndsInDisplay endsAtSec={pickConfig?.endsAt} />
      </TableCell>
      <TableCell>
        {isResolved && isWinner && BigInt(position.balance) > 0n ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onRedeem(position.tokenAddress, BigInt(position.balance))}
                  disabled={isRedeeming}
                >
                  {isRedeeming ? 'Redeeming...' : 'Redeem'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div>Claim {claimableFormatted} {collateralSymbol}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : !isResolved && pickConfig?.endsAt && pickConfig.endsAt * 1000 < Date.now() ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSettle(pickConfig.id)}
            disabled={isSettling}
          >
            {isSettling ? 'Settling...' : 'Settle'}
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function V2PositionsTable({
  account,
  showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId || 5064014] || 'USDe';
  const queryClient = useQueryClient();
  const { effectiveAddress } = useSession();

  const [settlingId, setSettlingId] = React.useState<string | null>(null);
  const [redeemingToken, setRedeemingToken] = React.useState<string | null>(null);

  const { settle, redeem, isPending } = useV2Write({ chainId });

  // Fetch V2 position balances
  const {
    data: positionBalances,
    isLoading,
    error,
    refetch,
  } = useV2PositionBalances({
    holder: account,
    chainId,
  });

  const handleSettle = React.useCallback(
    async (pickConfigId: string) => {
      setSettlingId(pickConfigId);
      try {
        // For V2, we need the predictionId, not pickConfigId
        // This would need to be looked up from the prediction data
        // For now, we'll use a placeholder
        const result = await settle({
          predictionId: pickConfigId as `0x${string}`,
        });
        if (result.success) {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['v2PositionBalances'] });
        }
      } finally {
        setSettlingId(null);
      }
    },
    [settle, refetch, queryClient]
  );

  const handleRedeem = React.useCallback(
    async (tokenAddress: string, amount: bigint) => {
      setRedeemingToken(tokenAddress);
      try {
        const result = await redeem({
          positionToken: tokenAddress as Address,
          amount,
        });
        if (result.success) {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['v2PositionBalances'] });
        }
      } finally {
        setRedeemingToken(null);
      }
    },
    [redeem, refetch, queryClient]
  );

  // Filter out zero balances
  const nonZeroBalances = (positionBalances ?? []).filter(
    (p) => BigInt(p.balance) > 0n
  );

  // Header with leftSlot (tab switcher) and optional title
  const headerContent = (
    <div className="px-4 py-4 border-b border-border flex items-center gap-4">
      {leftSlot}
      <div className="flex-1">
        {showHeaderText && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">V2 Positions</h3>
            <Badge variant="outline">{nonZeroBalances.length} positions</Badge>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {headerContent}
        <div className="flex items-center justify-center py-8">
          <Loader />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {headerContent}
        <div className="text-destructive text-center py-8">
          Error loading V2 positions
        </div>
      </>
    );
  }

  if (nonZeroBalances.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState
          message="No V2 positions found"
        />
      </>
    );
  }

  return (
    <>
      {headerContent}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Picks</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonZeroBalances.map((position) => (
              <V2PositionRow
                key={`${position.chainId}-${position.tokenAddress}-${position.holder}`}
                position={position}
                isPredictor={position.isPredictorToken}
                collateralSymbol={collateralSymbol}
                effectiveAddress={effectiveAddress?.toLowerCase() ?? null}
                onSettle={handleSettle}
                onRedeem={handleRedeem}
                isSettling={settlingId === position.pickConfigId}
                isRedeeming={redeemingToken === position.tokenAddress}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
