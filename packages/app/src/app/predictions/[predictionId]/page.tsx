import type { Metadata } from 'next';
import {
  PREDICTION_BY_ID_QUERY,
  CONDITIONS_BY_IDS_QUERY,
  getGraphQLEndpoint,
  type PredictionData,
  type ConditionData,
} from '~/app/og/_prediction-helpers';
import PredictionPageClient from './PredictionPageClient';

type PredictionPageProps = {
  params: Promise<{ predictionId: string }>;
};

function buildPredictionImageUrl(predictionId: string): string {
  const qp = new URLSearchParams();
  qp.set('predictionId', predictionId);
  return `/og/prediction?${qp.toString()}`;
}

export async function generateMetadata(
  props: PredictionPageProps
): Promise<Metadata> {
  const { predictionId } = await props.params;
  const img = buildPredictionImageUrl(predictionId);
  const title = `Prediction`;
  const description = `Prediction on Sapience Prediction Markets`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: img,
          width: 1200,
          height: 630,
          alt: 'Prediction',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [img],
    },
    robots: { index: true, follow: true },
  };
}

async function fetchPrediction(predictionId: string): Promise<{
  prediction: PredictionData | null;
  conditions: Map<string, ConditionData>;
}> {
  const conditions = new Map<string, ConditionData>();
  try {
    const endpoint = getGraphQLEndpoint();
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: PREDICTION_BY_ID_QUERY,
        variables: { predictionId },
      }),
      next: { revalidate: 30 },
    });
    if (!resp.ok) return { prediction: null, conditions };
    const json = await resp.json();
    const prediction: PredictionData | null = json?.data?.prediction ?? null;
    if (!prediction) return { prediction: null, conditions };

    // Fetch condition data for picks
    const conditionIds =
      prediction.pickConfig?.picks.map((p) => p.conditionId) ?? [];
    if (conditionIds.length > 0) {
      try {
        const condResp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: CONDITIONS_BY_IDS_QUERY,
            variables: { where: { id: { in: conditionIds } } },
          }),
          next: { revalidate: 30 },
        });
        if (!condResp.ok) throw new Error('Conditions fetch failed');
        const condJson = await condResp.json();
        const conds: ConditionData[] = condJson?.data?.conditions ?? [];
        for (const c of conds) {
          conditions.set(c.id, c);
        }
      } catch {
        // Condition fetch is non-critical
      }
    }

    return { prediction, conditions };
  } catch {
    return { prediction: null, conditions };
  }
}

export default async function PredictionPage(props: PredictionPageProps) {
  const { predictionId } = await props.params;
  const { prediction, conditions } = await fetchPrediction(predictionId);

  // Serialize conditions map for client component
  const conditionsArray = Array.from(conditions.entries()).map(
    ([id, data]) => ({ ...data, id })
  );

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <PredictionPageClient
            predictionId={predictionId}
            serverPrediction={prediction}
            serverConditions={conditionsArray}
          />
        </div>
      </main>
    </div>
  );
}
