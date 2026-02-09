import type { Metadata } from 'next';
import QuestionPageClient from './QuestionPageClient';

const APP_URL = 'https://sapience.xyz';

// Re-generate page metadata every 15 minutes so the OG image URL
// cache-buster advances and social platforms fetch a fresh image.
export const revalidate = 900;

type Props = {
  params: Promise<{ parts: string[] }>;
};

function getGraphQLEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
}

async function fetchQuestionTitle(
  conditionId: string,
  resolverAddress?: string
): Promise<string | null> {
  try {
    const query = `
      query ConditionForMeta($where: ConditionWhereInput!) {
        conditions(where: $where, take: 1) {
          shortName
          question
        }
      }
    `;

    const whereClause: { AND: Array<Record<string, unknown>> } = {
      AND: [{ id: { in: [conditionId] } }],
    };
    if (resolverAddress) {
      whereClause.AND.push({
        resolver: { equals: resolverAddress, mode: 'insensitive' },
      });
    }

    const response = await fetch(getGraphQLEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { where: whereClause } }),
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;

    const result = await response.json();
    const condition = result?.data?.conditions?.[0];
    return condition?.question || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parts } = await params;

  let conditionId: string | undefined;
  let resolverAddress: string | undefined;

  if (parts.length >= 2) {
    resolverAddress = parts[0];
    conditionId = parts[1];
  } else {
    conditionId = parts[0];
  }

  if (!conditionId) {
    return {
      title: 'Question',
      description: 'View and trade on prediction market outcomes',
    };
  }

  const questionTitle = await fetchQuestionTitle(conditionId, resolverAddress);

  const ogParams = new URLSearchParams({ conditionId });
  if (resolverAddress) ogParams.set('resolver', resolverAddress);
  // Time-bucketed cache buster: advances every 15 minutes so social
  // platforms (Twitter, Discord, Slack) re-scrape a fresh OG image.
  const cacheBucket = Math.floor(Date.now() / (15 * 60 * 1000));
  ogParams.set('v', String(cacheBucket));
  const ogImageUrl = `${APP_URL}/og/question?${ogParams.toString()}`;

  return {
    title: questionTitle || 'Question',
    description: questionTitle
      ? `Trade on: ${questionTitle}`
      : 'View and trade on prediction market outcomes',
    openGraph: {
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImageUrl],
    },
  };
}

export default async function QuestionPage({ params }: Props) {
  const { parts } = await params;
  return <QuestionPageClient parts={parts} />;
}
