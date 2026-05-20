import type { Metadata } from 'next';
import ForecastPageClient from './ForecastPageClient';
import { fetchForecastByUid } from '~/lib/data/forecasts';

type ForecastPageProps = {
  params: Promise<{ uid: string }>;
};

function buildForecastImageUrl(uid: string): string {
  const qp = new URLSearchParams();
  qp.set('uid', uid);
  return `/og/forecast?${qp.toString()}`;
}

export async function generateMetadata(
  props: ForecastPageProps
): Promise<Metadata> {
  const { uid } = await props.params;
  const forecast = await fetchForecastByUid(uid).catch(() => null);

  const question = forecast?.condition?.question ?? 'Forecast on Sapience';
  const img = buildForecastImageUrl(uid);
  const title = question;
  const description = `Forecast on Sapience`;

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
          alt: question,
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

export default async function ForecastPage({ params }: ForecastPageProps) {
  const { uid } = await params;
  const forecast = await fetchForecastByUid(uid).catch(() => null);

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <ForecastPageClient uid={uid} serverForecast={forecast} />
        </div>
      </main>
    </div>
  );
}
