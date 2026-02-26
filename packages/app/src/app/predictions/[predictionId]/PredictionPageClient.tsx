'use client';

import { formatEther } from 'viem';
import { PicksContent } from '~/components/shared/PicksSummary';
import PositionSummary from '~/components/positions/PositionSummary';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import type { PredictionData, ConditionData } from '~/app/og/_prediction-helpers';
import type { Pick } from '~/components/shared/StackedPredictions';

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
  const [showShare, setShowShare] = useState(false);

  if (!serverPrediction) {
    return (
      <div className="text-center text-muted-foreground">
        Prediction not found.
      </div>
    );
  }

  const conditionsMap = new Map(serverConditions.map((c) => [c.id, c]));
  const picks = serverPrediction.pickConfig?.picks ?? [];

  // Build legs from predictor's perspective
  const legs: Pick[] = picks.map((pick) => {
    const condition = conditionsMap.get(pick.conditionId);
    return {
      question: condition?.question || condition?.shortName || pick.conditionId,
      choice: pick.predictedOutcome === 1 ? 'YES' : 'NO',
      conditionId: pick.conditionId,
      categorySlug: condition?.category?.slug ?? null,
      endTime: condition?.endTime ?? null,
      settled: condition?.settled ?? false,
      resolvedToYes: condition?.resolvedToYes ?? false,
      resolverAddress: condition?.resolver ?? null,
    };
  });

  const positionSize = formatCollateral(serverPrediction.predictorCollateral);
  const totalPayout =
    formatCollateral(serverPrediction.predictorCollateral) +
    formatCollateral(serverPrediction.counterpartyCollateral);
  const createdAt = serverPrediction.createdAt
    ? new Date(serverPrediction.createdAt)
    : null;

  // Compute the maximum endTime from conditions
  const endsAtMs = picks.reduce((max, pick) => {
    const endTime = conditionsMap.get(pick.conditionId)?.endTime;
    return endTime ? Math.max(max, endTime * 1000) : max;
  }, 0) || null;

  const isSettled = serverPrediction.settled;
  const result = serverPrediction.result;
  const predictorWon = result === 'PREDICTOR_WINS';
  const positionWon =
    isSettled && (predictorWon || result === 'NON_DECISIVE');

  // PnL
  const pnl = isSettled
    ? positionWon
      ? totalPayout - positionSize
      : -positionSize
    : null;
  const roi =
    pnl !== null && positionSize > 0
      ? (pnl / positionSize) * 100
      : null;

  const shareImageSrc = `/og/prediction?predictionId=${encodeURIComponent(predictionId)}`;
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/predictions/${predictionId}`
      : `/predictions/${predictionId}`;

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
          predictorAddress={serverPrediction.predictor}
          counterpartyAddress={serverPrediction.counterparty}
        />
      </div>

      <PicksContent
        legs={legs}
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

      <div className="mt-6 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowShare(true)}
        >
          <Share2 className="mr-1 h-4 w-4" /> Share
        </Button>
      </div>

      <OgShareDialogBase
        imageSrc={shareImageSrc}
        open={showShare}
        onOpenChange={setShowShare}
        title="Share Prediction"
        shareUrl={shareUrl}
      />
    </>
  );
}
