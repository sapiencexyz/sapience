'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import { useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { PicksContent } from '~/components/shared/PicksSummary';
import PositionSummary from './PositionSummary';
import type { UIPosition } from './PositionsTable';

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

  const hasPythLeg = position.legs.some((leg) => leg.source === 'pyth');
  const isCounterparty = position.addressRole === 'counterparty';

  const viewerWagerWei =
    position.addressRole === 'predictor'
      ? (position.predictorCollateralWei ?? 0n)
      : position.addressRole === 'counterparty'
        ? (position.counterpartyCollateralWei ?? 0n)
        : (position.predictorCollateralWei ??
          position.counterpartyCollateralWei ??
          0n);
  const wager = Number(formatEther(viewerWagerWei));
  const toWin = Number(formatEther(position.totalPayoutWei || 0n));

  const isSettled = position.status !== 'active';
  const viewerLostFromDb =
    position.allConditionsSettled &&
    (position.addressRole === 'predictor'
      ? position.predictorWonFromDb === false
      : position.addressRole === 'counterparty'
        ? position.predictorWonFromDb === true
        : false);
  const viewerWonFromDb =
    position.allConditionsSettled &&
    (position.addressRole === 'predictor'
      ? position.predictorWonFromDb === true
      : position.addressRole === 'counterparty'
        ? position.predictorWonFromDb === false
        : false);

  const showPnl = isSettled || viewerLostFromDb;
  const pnlValue = viewerLostFromDb
    ? -wager
    : Number(formatEther(BigInt(position.userPnL || '0')));
  const roi = wager > 0 ? (pnlValue / wager) * 100 : 0;

  const positionUrl = `/positions/${position.marketAddress}/${position.positionId}`;
  const createdAt = position.createdAt ? new Date(position.createdAt) : null;

  const getPositionStatus = ():
    | 'won'
    | 'lost'
    | 'pending'
    | 'claimed'
    | 'active' => {
    if (position.status === 'won') return 'won';
    if (position.status === 'lost') return 'lost';
    if (viewerLostFromDb) return 'lost';
    if (viewerWonFromDb) return 'won';
    if (position.endsAt <= Date.now()) return 'pending';
    return 'active';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <PositionSummary
          positionId={position.positionId}
          isCounterparty={isCounterparty}
          hasPythLeg={hasPythLeg}
          createdAt={createdAt}
          endsAtMs={position.endsAt}
          wager={wager}
          toWin={toWin}
          pnl={showPnl ? pnlValue : null}
          roi={showPnl ? roi : null}
          isSettled={isSettled}
          viewerWon={position.status === 'won'}
          collateralSymbol={collateralSymbol}
          positionUrl={positionUrl}
          currentOwner={currentOwner as string | undefined}
          isOwnerLoading={isOwnerLoading}
          predictorAddress={position.predictor}
          counterpartyAddress={position.counterparty}
          compactHeader
        />

        <PicksContent
          legs={position.legs}
          positionId={position.positionId}
          isCounterparty={isCounterparty}
          hasPythLeg={hasPythLeg}
          hideHeader
          positionStatus={getPositionStatus()}
        />
      </DialogContent>
    </Dialog>
  );
}
