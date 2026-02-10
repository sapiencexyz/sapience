import type { Metadata } from 'next';
import {
  getGraphQLEndpoint,
  POSITION_BY_NFT_QUERY,
  type PositionData,
} from '~/app/og/_position-helpers';
import PositionPageClient from './PositionPageClient';

type PositionPageProps = {
  params: Promise<{ marketAddress: string; nftId: string }>;
};

function buildPositionImageUrl(nftId: string, marketAddress: string): string {
  const qp = new URLSearchParams();
  qp.set('nftId', nftId);
  qp.set('marketAddress', marketAddress);
  return `/og/position?${qp.toString()}`;
}

export async function generateMetadata(
  props: PositionPageProps
): Promise<Metadata> {
  const { marketAddress, nftId } = await props.params;
  const img = buildPositionImageUrl(nftId, marketAddress);
  const title = `Position #${nftId} | Sapience`;
  const description = `Position #${nftId} on Sapience Prediction Markets`;

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
          alt: `Position #${nftId}`,
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

const CONDITIONS_QUERY = `
  query ConditionCategories($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      category { slug }
    }
  }
`;

async function fetchPosition(
  nftId: string,
  marketAddress: string
): Promise<PositionData | null> {
  try {
    const endpoint = getGraphQLEndpoint();
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: POSITION_BY_NFT_QUERY,
        variables: { nftTokenId: nftId, marketAddress },
      }),
      next: { revalidate: 30 },
    });
    const json = await resp.json();
    const positions: PositionData[] = json?.data?.positions ?? [];
    const position = positions[0] ?? null;
    if (!position?.predictions?.length) return position;

    // Fetch category slugs via the full Condition type (ConditionSummary lacks category)
    try {
      const conditionIds = position.predictions.map((p) => p.conditionId);
      const BATCH = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < conditionIds.length; i += BATCH) {
        chunks.push(conditionIds.slice(i, i + BATCH));
      }
      const conditions: { id: string; category?: { slug: string } | null }[] = (
        await Promise.all(
          chunks.map(async (chunk) => {
            const catResp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: CONDITIONS_QUERY,
                variables: { where: { id: { in: chunk } } },
              }),
              next: { revalidate: 30 },
            });
            const catJson = await catResp.json();
            return catJson?.data?.conditions ?? [];
          })
        )
      ).flat();
      const catMap = new Map(
        conditions.map((c) => [c.id, c.category?.slug ?? null])
      );

      for (const pred of position.predictions) {
        if (pred.condition) {
          (pred.condition as Record<string, unknown>).categorySlug =
            catMap.get(pred.conditionId) ?? null;
        }
      }
    } catch {
      // Category fetch is non-critical; continue without it
    }

    return position;
  } catch {
    return null;
  }
}

export default async function PositionPage(props: PositionPageProps) {
  const { marketAddress, nftId } = await props.params;
  const position = await fetchPosition(nftId, marketAddress);

  return (
    <div className="relative min-h-[calc(100vh-200px)] flex items-center justify-center">
      <main className="relative container mx-auto px-4 py-8 max-w-4xl">
        <div className="rounded-lg border border-border bg-brand-black p-6">
          <PositionPageClient
            nftId={nftId}
            marketAddress={marketAddress}
            serverPosition={position}
          />
        </div>
      </main>
    </div>
  );
}
