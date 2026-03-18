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
      resolverAddress: condition?.resolver ?? null,
    };
  });

  const positionSize = formatCollateral(prediction.predictorCollateral);
  const totalPayout =
    formatCollateral(prediction.predictorCollateral) +
    formatCollateral(prediction.counterpartyCollateral);
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
  const positionWon = isSettled && (predictorWon || result === 'NON_DECISIVE');

  // PnL
  const pnl = isSettled
    ? positionWon
      ? totalPayout - positionSize
      : -positionSize
    : null;
  const roi =
    pnl !== null && positionSize > 0 ? (pnl / positionSize) * 100 : null;

  return (
    <>
      <div className="mb-6">
        <PositionSummary
          positionId={predictionId}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={positionSize}
          payout={totalPayout}
          pnl={pnl}
          roi={roi}
          isSettled={isSettled}
          positionWon={positionWon}
          predictorAddress={prediction.predictor}
          counterpartyAddress={prediction.counterparty}
        />
      </div>

      <PicksContent
        picks={displayPicks}
        positionId={predictionId}
        hideHeader
        positionStatus={
          isSettled
            ? positionWon
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
