'use client';

import { useQuery } from '@tanstack/react-query';
import PredictionDetails from '~/components/positions/PredictionDetails';
import type { ConditionsMap } from '~/components/positions/toPickLegs';
import type { PredictionData, ConditionData } from '~/lib/data/predictions';
import { fetchPredictionWithConditions } from '~/lib/data/predictions';

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

  const conditionsMap: ConditionsMap = new Map(
    conditions.map((c) => [c.id, c])
  );

  return (
    <PredictionDetails
      prediction={prediction}
      picks={prediction.pickConfig?.picks ?? []}
      conditionsMap={conditionsMap}
    />
  );
}
