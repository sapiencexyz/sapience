import type { Metadata } from 'next';
import { fetchAttestationByUid } from '~/app/og/_forecast-helpers';
import ForecastPageClient from './ForecastPageClient';

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
  const attestation = await fetchAttestationByUid(uid);

  const question = attestation?.condition?.question ?? 'Forecast on Sapience';
  const img = buildForecastImageUrl(uid);
  const title = `${question} | Sapience`;
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

export default async function ForecastPage(props: ForecastPageProps) {
  const { uid } = await props.params;
  const attestation = await fetchAttestationByUid(uid);

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <ForecastPageClient uid={uid} serverAttestation={attestation} />
        </div>
      </main>
    </div>
  );
}
