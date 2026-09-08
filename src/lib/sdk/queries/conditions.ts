import { graphqlRequest } from './client/graphqlClient';

export interface ConditionType {
  /** CTF on-chain condition id (lowercase 0x-hex) — `conditionId`. */
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  endTime: number;
  public: boolean;
  description: string;
  similarMarkets: string[];
  tags?: string[];
  chainId: number;
  resolver?: string | null;
  category?: { name: string; slug: string } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  openInterest: string;
  similarMarketVolume?: number;
  similarMarketImage?: string | null;
  /** Opaque ConditionGroup id — grouping identity only, not a row id. */
  conditionGroupId?: string | null;
  conditionGroup?: { name: string } | null;
  estimatedPrice?: number | null;
  similarMarketVolume1h?: number;
  similarMarketVolume4h?: number;
  similarMarketVolume24h?: number;
  similarMarketVolume7d?: number;
  similarMarketVolumeFiltered1h?: number;
  similarMarketVolumeFiltered4h?: number;
  similarMarketVolumeFiltered24h?: number;
  similarMarketVolumeFiltered7d?: number;
}

export interface ConditionFilters {
  search?: string;
  categorySlugs?: string[];
  endTimeGte?: number;
  endTimeLte?: number;
  publicOnly?: boolean;
  ungroupedOnly?: boolean;
  visibility?: 'all' | 'public' | 'private';
}

/** Max page size for the conditions / conditionGroups / pickConfigurations connections. */
const MAX_PAGE_SIZE = 25;

export const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($first: Int, $after: String, $filter: ConditionFilter) {
    conditions(
      first: $first
      after: $after
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: $filter
    ) {
      nodes {
        conditionId
        createdAt
        question
        shortName
        optionName
        endTime
        isPublic
        description
        chainId
        resolver
        settled
        resolvedToYes
        nonDecisive
        openInterest
        estimatedPrice
        similarMarketVolume
        similarMarket {
          image
          markets
        }
        conditionGroup {
          id
          name
        }
        category {
          name
          slug
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Builds a `ConditionFilter` from the stable {@link ConditionFilters}.
 *
 * Visibility is emitted EXPLICITLY — the server silently defaults to public-only
 * when `public` is omitted on listing surfaces, so we never rely on the default:
 * - `'public'` / `publicOnly` / unset → `public: true`
 * - `'private'` → `public: false`
 * - `'all'` → the ConditionFilter has no both-visibilities representation on
 *   listing surfaces (omitting `public` makes the server force public-only
 *   unless `conditionIds` is present). The closest expressible mapping is to
 *   omit the key, which degrades to public-only — a documented gap
 *   with no live callers.
 */
export function buildConditionFilter(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (chainId !== undefined) {
    filter.chainId = chainId;
  }

  if (filters?.visibility === 'private') {
    filter.public = false;
  } else if (filters?.visibility !== 'all') {
    filter.public = true;
  }

  if (filters?.search?.trim()) {
    filter.search = filters.search.trim();
  }

  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    filter.categorySlugs = filters.categorySlugs;
  }

  if (filters?.endTimeGte !== undefined || filters?.endTimeLte !== undefined) {
    const endTime: Record<string, number> = {};
    if (filters.endTimeGte !== undefined) {
      endTime.gte = filters.endTimeGte;
    }
    if (filters.endTimeLte !== undefined) {
      endTime.lte = filters.endTimeLte;
    }
    filter.endTime = endTime;
  }

  if (filters?.ungroupedOnly) {
    filter.ungrouped = true;
  }

  return filter;
}

type ConditionNode = {
  conditionId: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  endTime: number | string;
  isPublic: boolean;
  description: string;
  chainId: number;
  resolver?: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  estimatedPrice?: number | null;
  similarMarketVolume?: number;
  similarMarket?: { image?: string | null; markets?: string[] } | null;
  conditionGroup?: { id: string; name: string } | null;
  category?: { name: string; slug: string } | null;
};

type ConditionsResponse = {
  conditions: {
    nodes: ConditionNode[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

function toConditionType(node: ConditionNode): ConditionType {
  return {
    id: node.conditionId,
    createdAt: node.createdAt,
    question: node.question,
    shortName: node.shortName ?? null,
    optionName: node.optionName ?? null,
    endTime: Number(node.endTime),
    public: node.isPublic,
    description: node.description,
    similarMarkets: node.similarMarket?.markets ?? [],
    chainId: node.chainId,
    resolver: node.resolver ?? null,
    settled: node.settled,
    resolvedToYes: node.resolvedToYes,
    nonDecisive: node.nonDecisive,
    openInterest: String(node.openInterest ?? '0'),
    estimatedPrice: node.estimatedPrice ?? null,
    similarMarketVolume: node.similarMarketVolume,
    similarMarketImage: node.similarMarket?.image ?? null,
    conditionGroupId: node.conditionGroup?.id ?? null,
    conditionGroup: node.conditionGroup
      ? { name: node.conditionGroup.name }
      : null,
    category: node.category
      ? { name: node.category.name, slug: node.category.slug }
      : null,
  };
}

export async function fetchConditions(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilters;
}): Promise<ConditionType[]> {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const filter = buildConditionFilter(opts?.chainId, opts?.filters);

  const target = skip + take;
  const nodes: ConditionNode[] = [];
  let after: string | null = null;

  while (nodes.length < target) {
    const first = Math.min(target - nodes.length, MAX_PAGE_SIZE);
    const data: ConditionsResponse = await graphqlRequest<ConditionsResponse>(
      GET_CONDITIONS,
      {
        first,
        after,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      }
    );
    const pageNodes = data?.conditions?.nodes;
    if (!Array.isArray(pageNodes)) {
      throw new Error('Failed to fetch conditions: Invalid response structure');
    }
    nodes.push(...pageNodes);
    const pageInfo = data.conditions.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return nodes.map(toConditionType).slice(skip, skip + take);
}

// --- fetchConditionsByIds ---

const PAGE_SIZE = 25; // == the connection's max page size, so each chunk fits one page
const MAX_CONCURRENT_REQUESTS = 3;

/**
 * Generic by-ids fetcher over the GraphQL endpoint.
 *
 * The supplied document must accept a `$ids: [Bytes!]!` variable, filter via
 * `filter: { conditionIds: $ids }`, and select a connection under
 * `resultKey` (nodes are unwrapped here). Note that the server returns BOTH public
 * and private conditions when `conditionIds` is present.
 */
export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[],
  resultKey = 'conditions'
): Promise<T[]> {
  if (ids.length === 0) return [];

  type ByIdsResponse = Record<string, { nodes?: T[] } | null | undefined>;
  const requestChunk = async (chunk: string[]): Promise<T[]> => {
    const resp = await graphqlRequest<ByIdsResponse>(query, { ids: chunk });
    return resp?.[resultKey]?.nodes ?? [];
  };

  if (ids.length <= PAGE_SIZE) {
    return requestChunk(ids);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    chunks.push(ids.slice(i, i + PAGE_SIZE));
  }

  const results: T[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const batchResults = await Promise.all(batch.map(requestChunk));
    results.push(...batchResults);
  }

  return results.flat();
}

// --- fetchConditionsByIdsQuery (for useConditionsByIds) ---

type ConditionById = {
  id: string;
  shortName?: string | null;
  optionName?: string | null;
  question?: string | null;
  description?: string | null;
  endTime?: number | null;
  resolver?: string | null;
  similarMarkets?: string[];
  category?: { slug?: string | null } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  estimatedPrice?: number | null;
};

export const CONDITIONS_BY_IDS_QUERY = /* GraphQL */ `
  query ConditionsByIds($ids: [Bytes!]!) {
    conditions(
      first: 25
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: { conditionIds: $ids }
    ) {
      nodes {
        id: conditionId
        shortName
        optionName
        question
        description
        endTime
        resolver
        settled
        resolvedToYes
        nonDecisive
        estimatedPrice
        similarMarket {
          markets
        }
        category {
          slug
        }
      }
    }
  }
`;

type ConditionByIdNode = Omit<ConditionById, 'similarMarkets'> & {
  similarMarket?: { markets?: string[] } | null;
};

function toConditionById(node: ConditionByIdNode): ConditionById {
  const { similarMarket, ...rest } = node;
  return { ...rest, similarMarkets: similarMarket?.markets ?? [] };
}

export async function fetchConditionsByIdsQuery(
  ids: string[]
): Promise<ConditionById[]> {
  const nodes = await fetchConditionsByIds<ConditionByIdNode>(
    CONDITIONS_BY_IDS_QUERY,
    ids
  );
  return nodes.map(toConditionById);
}

export type { ConditionById };
