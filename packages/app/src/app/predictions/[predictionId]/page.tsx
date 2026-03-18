import type { Metadata } from 'next';
import PredictionPageClient from './PredictionPageClient';
import { fetchPredictionWithConditions } from '~/lib/data/predictions';

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

export default async function PredictionPage({ params }: PredictionPageProps) {
  const { predictionId } = await params;
  const result = await fetchPredictionWithConditions(predictionId).catch(
    (): Awaited<ReturnType<typeof fetchPredictionWithConditions>> => ({
      prediction: null,
      conditions: [],
    })
  );

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <PredictionPageClient
            predictionId={predictionId}
            serverPrediction={result.prediction}
            serverConditions={result.conditions}
          />
        </div>
      </main>
    </div>
  );
}
