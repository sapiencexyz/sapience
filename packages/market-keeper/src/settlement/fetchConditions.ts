import { fetchWithRetry } from '../utils';

export interface SettlementCondition {
  id: string;
  question: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ConditionsQueryResponse {
  conditionsConnection?: {
    nodes?: SettlementCondition[];
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
  } | null;
}

const CONDITIONS_PAGE_SIZE = 30;

const RESOLVER_CONDITIONS_QUERY = /* GraphQL */ `
  query ResolverConditions($first: Int!, $after: String, $resolver: Address!) {
    conditionsConnection(
      filter: {
        settled: false
        resolverAddress: $resolver
        # Pick up both public and private — the deprecated resolver's
        # implicit public=true filter would silently exclude privated
        # conditions that still have engagement to settle.
        visibility: ALL
        engagement: ANY
      }
      orderBy: { field: RESOLVES_AT, direction: ASC }
      first: $first
      after: $after
    ) {
      nodes {
        id: conditionId
        question
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function fetchResolverConditionsPage(
  graphqlUrl: string,
  resolver: string,
  first: number,
  after: string | null
): Promise<{
  items: SettlementCondition[];
  hasMore: boolean;
  endCursor: string | null;
}> {
  const response = await fetchWithRetry(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: RESOLVER_CONDITIONS_QUERY,
      variables: { resolver, first, after },
    }),
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '(could not read response body)';
    }
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}\n` +
        `URL: ${graphqlUrl}\n` +
        `Response: ${errorBody.slice(0, 500)}`
    );
  }

  let result: GraphQLResponse<ConditionsQueryResponse>;
  try {
    result =
      (await response.json()) as GraphQLResponse<ConditionsQueryResponse>;
  } catch {
    const text = await response
      .clone()
      .text()
      .catch(() => '(could not read body)');
    throw new Error(
      `Failed to parse GraphQL response as JSON\n` +
        `URL: ${graphqlUrl}\n` +
        `Response: ${text.slice(0, 500)}`
    );
  }

  if (result.errors?.length) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
    );
  }

  const page = result.data?.conditionsConnection;
  return {
    items: page?.nodes ?? [],
    hasMore: Boolean(page?.pageInfo?.hasNextPage),
    endCursor: page?.pageInfo?.endCursor ?? null,
  };
}

export async function fetchResolverConditions(
  graphqlUrl: string,
  resolver: string
): Promise<SettlementCondition[]> {
  const allConditions: SettlementCondition[] = [];
  let after: string | null = null;

  console.log(`Fetching unresolved conditions from ${graphqlUrl}...`);

  while (true) {
    const page = await fetchResolverConditionsPage(
      graphqlUrl,
      resolver,
      CONDITIONS_PAGE_SIZE,
      after
    );

    allConditions.push(...page.items);

    if (page.items.length > 0) {
      console.log(`  Fetched ${allConditions.length} conditions so far...`);
    }

    if (!page.hasMore || !page.endCursor) break;
    after = page.endCursor;
  }

  console.log(`Found ${allConditions.length} unresolved conditions`);

  return allConditions;
}
