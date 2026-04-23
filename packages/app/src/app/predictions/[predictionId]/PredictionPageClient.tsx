'use client';

import { formatEther } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { OutcomeSide } from '@sapience/sdk/types';
import { PicksContent } from '~/components/shared/PicksSummary';
import PositionSummary from '~/components/positions/PositionSummary';
import type { PredictionData, ConditionData } from '~/lib/data/predictions';
import { fetchPredictionWithConditions } from '~/lib/data/predictions';
import type { Pick } from '~/components/shared/StackedPredictions';
import { computeResultFromConditions } from '~/components/positions/toPickLegs';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';

function formatCollateral(wei?: string): number {
  if (!wei) return 0;
  try {
    return Number(formatEther(BigInt(wei)));
  } catch {
    return 0;
  }
}

export default function PredictionPageClient({
  predictionId,
  serverPrediction,
  serverConditions,
}: {
  predictionId: string;
  serverPrediction: PredictionData | null;
  serverConditions: (ConditionData & { id: string })[];
}) {
  const {
    data: clientData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['prediction', predictionId],
    queryFn: () => fetchPredictionWithConditions(predictionId),
    enabled: !serverPrediction,
  });

  const prediction = serverPrediction ?? clientData?.prediction ?? null;
  const conditions =
    serverConditions.length > 0
      ? serverConditions
      : (clientData?.conditions ?? []);

  if (!serverPrediction && isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading prediction...
        </div>
      </div>
    );
  }

  if (!serverPrediction && isError) {
    return (
      <div className="text-center text-muted-foreground">
        Failed to load prediction. Please check your connection and try again.
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="text-center text-muted-foreground">
        Prediction not found.
      </div>
    );
  }

  const conditionsMap = new Map(conditions.map((c) => [c.id, c]));
  const picks = prediction.pickConfig?.picks ?? [];

  // Build picks from predictor's perspective
  const displayPicks: Pick[] = picks.map((pick) => {
    const condition = conditionsMap.get(pick.conditionId);
    const resolverAddr = pick.conditionResolver ?? condition?.resolver ?? null;
    const resolverKind = inferResolverKind(resolverAddr);
    return {
      question: condition?.question || condition?.shortName || pick.conditionId,
      choice:
        (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES
          ? 'YES'
          : 'NO',
      conditionId: pick.conditionId,
      categorySlug: condition?.category?.slug ?? null,
      endTime: condition?.endTime ?? null,
      settled: condition?.settled ?? false,
      resolvedToYes: condition?.resolvedToYes ?? false,
      nonDecisive: condition?.nonDecisive,
      resolverAddress: resolverAddr,
      ...(resolverKind === 'pyth' && { source: 'pyth' as const }),
    };
  });

  const predictorStake = formatCollateral(prediction.predictorCollateral);
  const counterpartyStake = formatCollateral(prediction.counterpartyCollateral);
  const totalPayout = predictorStake + counterpartyStake;
  const createdAt = prediction.createdAt
    ? new Date(prediction.createdAt)
    : null;

  // Compute the maximum endTime from conditions
  const endsAtMs =
    picks.reduce((max, pick) => {
      const endTime = conditionsMap.get(pick.conditionId)?.endTime;
      return endTime ? Math.max(max, endTime * 1000) : max;
    }, 0) || null;

  // Compute result from individual conditions when prediction not yet settled on-chain
  const computed = !prediction.settled
    ? computeResultFromConditions(
        picks,
        conditionsMap as Parameters<typeof computeResultFromConditions>[1]
      )
    : null;
  const isSettled = prediction.settled || computed?.result !== 'UNRESOLVED';
  const result = prediction.settled
    ? prediction.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  // NON_DECISIVE resolves to the counterparty on-chain.
  const counterpartyWon =
    result === 'COUNTERPARTY_WINS' || result === 'NON_DECISIVE';

  return (
    <>
      <div className="mb-6">
        <PositionSummary
          positionId={predictionId}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={0}
          payout={totalPayout}
          pnl={null}
          roi={null}
          isSettled={isSettled}
          predictorAddress={prediction.predictor}
          counterpartyAddress={prediction.counterparty}
          predictorStake={predictorStake}
          counterpartyStake={counterpartyStake}
          predictorWon={predictorWon}
          counterpartyWon={counterpartyWon}
        />
      </div>

      <PicksContent
        picks={displayPicks}
        positionId={predictionId}
        hideHeader
        positionStatus={
          isSettled
            ? predictorWon
              ? 'won'
              : 'lost'
            : endsAtMs && endsAtMs <= Date.now()
              ? 'pending'
              : 'active'
        }
      />
    </>
  );
}
