'use client';

import { formatEther, type Address } from 'viem';
import { useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { PicksContent } from '~/components/shared/PicksSummary';
import type { PositionData } from '~/app/og/_position-helpers';
import type { Pick } from '~/components/shared/StackedPredictions';
import PositionSummary from '~/components/positions/PositionSummary';
import { calculatePositionPnL } from '~/lib/utils/calculatePositionPnL';

function positionToLegs(position: PositionData): Pick[] {
  return (position.predictions ?? []).map((pred) => ({
    question: pred.condition?.question || pred.conditionId,
    choice: pred.outcomeYes ? 'YES' : 'NO',
    conditionId: pred.conditionId,
    categorySlug: pred.condition?.categorySlug ?? null,
    endTime: pred.condition?.endTime ?? null,
    settled: pred.condition?.settled ?? false,
    resolvedToYes: pred.condition?.resolvedToYes ?? false,
    resolverAddress: pred.condition?.resolver ?? null,
  }));
}

function formatCollateral(wei?: string): number {
  if (!wei) return 0;
  try {
    return Number(formatEther(BigInt(wei)));
  } catch {
    return 0;
  }
}

export default function PositionPageClient({
  nftId,
  marketAddress,
  serverPosition,
}: {
  nftId: string;
  marketAddress: string;
  serverPosition: PositionData | null;
}) {
  // Fetch current NFT owner on-chain (must be called before any early return)
  const { data: currentOwner, isLoading: isOwnerLoading } = useReadContract({
    address: marketAddress as Address,
    abi: predictionMarketAbi,
    functionName: 'ownerOf',
    args: [BigInt(nftId)],
    chainId: serverPosition?.chainId ?? DEFAULT_CHAIN_ID,
  });

  if (!serverPosition) {
    return (
      <div className="text-center text-muted-foreground">
        Position not found.
      </div>
    );
  }

  // Determine if this NFT is the counterparty position (intrinsic to the NFT being viewed)
  const isCounterpartyPosition =
    serverPosition.counterpartyNftTokenId === nftId;
  const legs = positionToLegs(serverPosition);

  // Flip choices for counterparty position (they predict the opposite)
  if (isCounterpartyPosition) {
    for (const leg of legs) {
      const upper = String(leg.choice || '').toUpperCase();
      if (upper === 'YES') leg.choice = 'NO';
      else if (upper === 'NO') leg.choice = 'YES';
    }
  }

  // Position size is based on which position this NFT represents
  const positionSize = formatCollateral(
    isCounterpartyPosition
      ? serverPosition.counterpartyCollateral
      : serverPosition.predictorCollateral
  );
  const payout = formatCollateral(serverPosition.totalCollateral);
  const createdAt = serverPosition.mintedAt
    ? new Date(serverPosition.mintedAt * 1000)
    : null;
  const endsAtMs = serverPosition.endsAt ? serverPosition.endsAt * 1000 : null;

  // Compute PnL for settled positions
  const isSettled =
    serverPosition.status === 'settled' ||
    serverPosition.status === 'consolidated';
  const pnlResult = calculatePositionPnL({
    isSettled,
    predictorWon: serverPosition.predictorWon,
    isCounterparty: isCounterpartyPosition,
    predictorCollateral: serverPosition.predictorCollateral,
    counterpartyCollateral: serverPosition.counterpartyCollateral,
    totalCollateral: serverPosition.totalCollateral,
  });
  const pnl = pnlResult?.pnl ?? null;
  const roi = pnlResult?.roi ?? null;

  // Determine if this position won
  const positionWon =
    isSettled &&
    serverPosition.predictorWon !== null &&
    serverPosition.predictorWon !== undefined &&
    (isCounterpartyPosition
      ? !serverPosition.predictorWon // Counterparty wins when predictor loses
      : serverPosition.predictorWon); // Predictor wins when predictorWon is true

  return (
    <>
      <div className="mb-6">
        <PositionSummary
          positionId={nftId}
          isCounterpartyPosition={isCounterpartyPosition}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={positionSize}
          payout={payout}
          pnl={pnl}
          roi={roi}
          isSettled={isSettled}
          positionWon={positionWon}
          currentOwner={currentOwner as string | undefined}
          isOwnerLoading={isOwnerLoading}
          predictorAddress={serverPosition.predictor}
          counterpartyAddress={serverPosition.counterparty}
        />
      </div>

      <PicksContent
        legs={legs}
        positionId={nftId}
        isCounterparty={isCounterpartyPosition}
        hideHeader
        positionStatus={
          isSettled
            ? positionWon
              ? isOwnerLoading
                ? 'won'
                : currentOwner
                  ? 'won'
                  : 'claimed'
              : 'lost'
            : serverPosition.endsAt &&
                serverPosition.endsAt * 1000 <= Date.now()
              ? 'pending'
              : 'active'
        }
      />
    </>
  );
}
