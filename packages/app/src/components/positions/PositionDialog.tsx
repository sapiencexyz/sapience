'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import { useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { PicksContent } from '~/components/shared/PicksSummary';
import PositionSummary from './PositionSummary';
import type { UIPosition } from './LegacyPositionsTable';

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: UIPosition | null;
  collateralSymbol?: string;
}

export default function PositionDialog({
  open,
  onOpenChange,
  position,
  collateralSymbol = 'USDe',
}: PositionDialogProps) {
  // Fetch current NFT owner on-chain (must be called before any early return)
  const { data: currentOwner, isLoading: isOwnerLoading } = useReadContract({
    address: position?.marketAddress,
    abi: predictionMarketAbi,
    functionName: 'ownerOf',
    args: position ? [BigInt(position.positionId)] : undefined,
    chainId: position?.chainId,
    query: {
      enabled: !!position && open,
    },
  });

  if (!position) return null;

  const isCounterpartyPosition = position.isCounterpartyPosition;

  const positionSize = Number(formatEther(position.positionSizeWei));
  const payout = Number(formatEther(position.totalPayoutWei || 0n));

  const isSettled = position.status !== 'active';

  // Determine if this position lost/won based on settlement data
  const positionLostFromDb =
    position.allConditionsSettled &&
    (isCounterpartyPosition
      ? position.predictorWonFromDb === true // Counterparty loses when predictor wins
      : position.predictorWonFromDb === false); // Predictor loses when predictorWon is false
  const positionWonFromDb =
    position.allConditionsSettled &&
    (isCounterpartyPosition
      ? position.predictorWonFromDb === false // Counterparty wins when predictor loses
      : position.predictorWonFromDb === true); // Predictor wins when predictorWon is true

  const showPnl = isSettled || positionLostFromDb;
  const pnlValue = positionLostFromDb
    ? -positionSize
    : Number(formatEther(BigInt(position.pnlWei || '0')));
  const roi = positionSize > 0 ? (pnlValue / positionSize) * 100 : 0;

  const positionUrl = `/predictions/${position.positionId}`;
  const createdAt = position.createdAt ? new Date(position.createdAt) : null;

  const getPositionStatus = ():
    | 'won'
    | 'lost'
    | 'pending'
    | 'claimed'
    | 'active' => {
    if (position.status === 'won') return 'won';
    if (position.status === 'lost') return 'lost';
    if (positionLostFromDb) return 'lost';
    if (positionWonFromDb) return 'won';
    if (position.endsAt <= Date.now()) return 'pending';
    return 'active';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8">
        <PositionSummary
          positionId={position.positionId}
          isCounterpartyPosition={isCounterpartyPosition}
          createdAt={createdAt}
          endsAtMs={position.endsAt}
          positionSize={positionSize}
          payout={payout}
          pnl={showPnl ? pnlValue : null}
          roi={showPnl ? roi : null}
          isSettled={isSettled}
          positionWon={position.status === 'won' || positionWonFromDb}
          collateralSymbol={collateralSymbol}
          positionUrl={positionUrl}
          currentOwner={currentOwner as string | undefined}
          isOwnerLoading={isOwnerLoading}
          predictorAddress={position.predictor}
          counterpartyAddress={position.counterparty}
        />

        <PicksContent
          picks={position.legs}
          positionId={position.positionId}
          isCounterparty={isCounterpartyPosition}
          hideHeader
          positionStatus={getPositionStatus()}
        />
      </DialogContent>
    </Dialog>
  );
}
