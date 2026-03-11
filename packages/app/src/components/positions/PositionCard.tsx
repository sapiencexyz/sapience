'use client';

import * as React from 'react';
import { formatEther, type Address } from 'viem';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@sapience/ui/components/ui/card';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import type { PositionBalance, PickData } from '~/hooks/graphql/usePositions';
import { useClaimableAmount } from '~/hooks/blockchain/useEscrowContract';
import { useEscrowWrite } from '~/hooks/blockchain/useEscrowWrite';
import SellPositionDialog from '~/components/secondary/SellPositionDialog';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

interface PositionCardProps {
  position: PositionBalance;
  collateralSymbol: string;
  onRefetch?: () => void;
}

// Settlement result styling
const RESULT_CONFIG = {
  UNRESOLVED: {
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  PREDICTOR_WINS: {
    label: 'Predictor Wins',
    icon: TrendingUp,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  COUNTERPARTY_WINS: {
    label: 'Counterparty Wins',
    icon: TrendingDown,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  NON_DECISIVE: {
    label: 'Split Outcome',
    icon: AlertCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
};

function PickDisplay({ pick }: { pick: PickData }) {
  const outcomeLabel = pick.predictedOutcome === 0 ? 'YES' : 'NO';
  const outcomeColor =
    pick.predictedOutcome === 0 ? 'text-emerald-500' : 'text-red-500';
  const question = `Condition ${pick.conditionId.slice(0, 10)}...`;

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" title={pick.conditionId}>
          {question}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Badge variant="outline" className={outcomeColor}>
          {outcomeLabel}
        </Badge>
      </div>
    </div>
  );
}

export default function PositionCard({
  position,
  collateralSymbol,
  onRefetch,
}: PositionCardProps) {
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const pickConfig = position.pickConfig;
  const isPredictor = position.isPredictorToken;
  const isResolved = pickConfig?.resolved ?? false;
  const result = pickConfig?.result ?? 'UNRESOLVED';

  const { settleAndRedeem } = useEscrowWrite({ chainId: position.chainId });

  // Determine if this position is a winner
  const isWinner =
    isResolved &&
    ((isPredictor && result === 'PREDICTOR_WINS') ||
      (!isPredictor && result === 'COUNTERPARTY_WINS') ||
      result === 'NON_DECISIVE');

  // Get claimable amount
  const { claimableAmount, isLoading: isLoadingClaimable } = useClaimableAmount(
    {
      pickConfigId: pickConfig?.id as `0x${string}`,
      tokenAddress: position.tokenAddress as Address,
      amount: BigInt(position.balance),
      chainId: position.chainId,
      enabled: isResolved && BigInt(position.balance) > 0n,
    }
  );

  const balanceFormatted = parseFloat(formatEther(BigInt(position.balance)));
  const claimableFormatted = claimableAmount
    ? parseFloat(formatEther(claimableAmount))
    : 0;

  const resultConfig =
    RESULT_CONFIG[result as keyof typeof RESULT_CONFIG] ||
    RESULT_CONFIG.UNRESOLVED;
  const ResultIcon = resultConfig.icon;

  // Calculate time remaining
  const endsAtMs = pickConfig?.endsAt ? pickConfig.endsAt * 1000 : null;
  const isPast = endsAtMs ? endsAtMs <= Date.now() : false;

  const handleRedeem = React.useCallback(async () => {
    if (!position.tokenAddress || BigInt(position.balance) <= 0n) return;
    const predictionId = pickConfig?.predictionId;
    if (!predictionId) return;

    setIsRedeeming(true);
    try {
      const redeemResult = await settleAndRedeem({
        predictionId: predictionId as `0x${string}`,
        positionToken: position.tokenAddress as Address,
        amount: BigInt(position.balance),
      });
      if (redeemResult.success) {
        onRefetch?.();
      }
    } finally {
      setIsRedeeming(false);
    }
  }, [
    position.tokenAddress,
    position.balance,
    pickConfig,
    settleAndRedeem,
    onRefetch,
  ]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant={isPredictor ? 'default' : 'secondary'}>
                {isPredictor ? 'Predictor' : 'Counterparty'}
              </Badge>
              <span className="text-muted-foreground font-normal text-sm">
                {pickConfig?.picks?.length ?? 0} pick
                {(pickConfig?.picks?.length ?? 0) !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${resultConfig.bgColor}`}
          >
            <ResultIcon className={`w-4 h-4 ${resultConfig.color}`} />
            <span className={`text-sm font-medium ${resultConfig.color}`}>
              {resultConfig.label}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Picks list */}
        {pickConfig?.picks && pickConfig.picks.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            {pickConfig.picks.map((pick, idx) => (
              <PickDisplay key={idx} pick={pick} />
            ))}
          </div>
        )}

        {/* Balance and timing info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Your Balance</p>
            <div className="flex items-baseline gap-1">
              <NumberDisplay
                value={balanceFormatted}
                className="text-lg font-semibold"
              />
              <span className="text-sm text-muted-foreground">
                {collateralSymbol}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {isResolved ? 'Claimable' : 'Ends'}
            </p>
            {isResolved ? (
              <div className="flex items-baseline gap-1">
                <NumberDisplay
                  value={claimableFormatted}
                  className={`text-lg font-semibold ${isWinner ? 'text-emerald-500' : 'text-muted-foreground'}`}
                />
                <span className="text-sm text-muted-foreground">
                  {collateralSymbol}
                </span>
              </div>
            ) : endsAtMs ? (
              <p
                className={`text-lg font-semibold ${isPast ? 'text-amber-500' : ''}`}
              >
                {isPast
                  ? 'Awaiting Settlement'
                  : formatDistanceToNowStrict(new Date(endsAtMs), {
                      roundingMethod: 'round',
                    })}
              </p>
            ) : (
              <p className="text-lg font-semibold text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {/* Pool totals */}
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
          <div>
            <span>Total Predictor Pool: </span>
            <NumberDisplay
              value={parseFloat(
                formatEther(BigInt(pickConfig?.totalPredictorCollateral ?? '0'))
              )}
              appendedText={collateralSymbol}
            />
          </div>
          <div>
            <span>Total Counterparty Pool: </span>
            <NumberDisplay
              value={parseFloat(
                formatEther(
                  BigInt(pickConfig?.totalCounterpartyCollateral ?? '0')
                )
              )}
              appendedText={collateralSymbol}
            />
          </div>
        </div>

        {/* Sell button — unresolved escrow positions with balance */}
        {!isResolved && BigInt(position.balance) > 0n && (
          <SellPositionDialog
            position={position}
            collateralSymbol={
              COLLATERAL_SYMBOLS[position.chainId] ?? collateralSymbol
            }
            onSuccess={onRefetch}
          >
            <Button variant="outline" className="w-full">
              Sell
            </Button>
          </SellPositionDialog>
        )}

        {/* Action button */}
        {isResolved && isWinner && BigInt(position.balance) > 0n && (
          <Button
            className="w-full"
            onClick={handleRedeem}
            disabled={isRedeeming || isLoadingClaimable}
          >
            {isRedeeming ? (
              'Redeeming...'
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Redeem {claimableFormatted} {collateralSymbol}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
