import type { Metadata } from 'next';
import QuestionPageClient from './QuestionPageClient';
import { buildGraphQLGetUrl } from '~/lib/data/graphql';

const APP_URL = 'https://sapience.xyz';

type Props = {
  params: Promise<{ parts: string[] }>;
};

async function fetchQuestionTitle(
  conditionId: string,
  resolverAddress?: string
): Promise<string | null> {
  try {
    // By-ids lookups skip the public-only listing default, and
    // `resolvers` composes with `conditionIds` for the multi-resolver
    // disambiguation (both matched case-insensitively server-side).
    const query = `
      query ConditionForMeta($ids: [Bytes!]!, $resolvers: [Address!]) {
        conditions(
          first: 1
          orderBy: { field: CREATED_AT, direction: DESC }
          filter: { conditionIds: $ids, resolvers: $resolvers }
        ) {
          nodes {
            shortName
            question
          }
        }
      }
    `;

    const variables = {
      ids: [conditionId],
      resolvers: resolverAddress ? [resolverAddress] : null,
    };

    const response = await fetch(buildGraphQLGetUrl(query, variables), {
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;

    const result = await response.json();
    const condition = result?.data?.conditions?.nodes?.[0];
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

  // The dynamic `/og/question` renderer was a route handler, which `output:
  // 'export'` cannot emit — it was removed with the rest of the server routes.
  // The static card carries no per-question text, so there is nothing left to
  // cache-bust.
  const ogImageUrl = `${APP_URL}/og-image.png`;

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
