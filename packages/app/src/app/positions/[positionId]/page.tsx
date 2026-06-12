import type { Metadata } from 'next';
import PositionPageClient from './PositionPageClient';
import { fetchPositionById } from '~/lib/data/positions';

type PositionPageProps = {
  params: Promise<{ positionId: string }>;
};

export function generateMetadata(): Metadata {
  const title = `Position`;
  const description = `Position on Sapience Prediction Markets`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PositionPage({ params }: PositionPageProps) {
  const { positionId } = await params;
  const serverPosition = await fetchPositionById(Number(positionId)).catch(
    () => null
  );

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <PositionPageClient
            positionId={positionId}
            serverPosition={serverPosition}
          />
        </div>
      </main>
    </div>
  );
}
