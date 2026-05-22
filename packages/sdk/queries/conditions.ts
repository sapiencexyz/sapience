import { graphqlRequest } from './client/graphqlClient';
import {
  clampConnectionTake,
  fetchConnectionPage,
  type ConnectionPage,
} from './connectionPage';

export interface ConditionType {
  id: string;
  conditionId: string;
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
  category?: { id: number; name: string; slug: string } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  assertionId?: string;
  assertionTimestamp?: number;
  openInterest: string;
  similarMarketVolume?: number;
  similarMarketImage?: string | null;
  conditionGroupId?: number | null;
  conditionGroup?: { id: number; name: string } | null;
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

export interface ConditionFilter {
  search?: string;
  categorySlugs?: string[];
  endTimeGte?: number;
  endTimeLte?: number;
  publicOnly?: boolean;
  ungroupedOnly?: boolean;
  visibility?: 'all' | 'public' | 'private';
  marketAddress?: string;
  marketAddressIn?: string[];
}

export type ConditionFilters = ConditionFilter;

const CONDITION_FIELDS = /* GraphQL */ `
  id: conditionId
  conditionId
  createdAt
  question
  shortName
  optionName
  endTime
  public
  description
  similarMarkets
  tags
  chainId
  resolver
  settled
  resolvedToYes
  nonDecisive
  assertionId
  assertionTimestamp
  openInterest
  similarMarketVolume
  similarMarketImage
  estimatedPrice
  conditionGroupId
  conditionGroup {
    id
    name
  }
  category {
    id
    name
    slug
  }
`;

export const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($take: Int, $after: String, $filter: ConditionFilter) {
    conditionsConnection(
      first: $take
      after: $after
      filter: $filter
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        ${CONDITION_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export function buildConditionsFilters(
  chainId?: number,
  filters?: ConditionFilter
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (chainId !== undefined) out.chainId = chainId;
  if (filters?.visibility === 'all') out.visibility = 'ALL';
  else if (filters?.visibility === 'private') out.visibility = 'PRIVATE';
  else if (filters?.visibility === 'public' || filters?.publicOnly)
    out.visibility = 'PUBLIC';
  if (filters?.search?.trim()) out.search = filters.search.trim();
  if (filters?.categorySlugs?.length) out.categorySlugs = filters.categorySlugs;
  if (filters?.endTimeGte !== undefined || filters?.endTimeLte !== undefined) {
    out.resolvesAt = {
      ...(filters.endTimeGte !== undefined ? { gte: filters.endTimeGte } : {}),
      ...(filters.endTimeLte !== undefined ? { lte: filters.endTimeLte } : {}),
    };
  }
  if (filters?.ungroupedOnly) out.conditionGroupId = { isNull: true };
  if (filters?.marketAddress) out.marketAddress = filters.marketAddress;
  if (filters?.marketAddressIn?.length)
    out.marketAddressIn = filters.marketAddressIn;

  return out;
}

/** @deprecated Kept as a back-compat alias. Use `buildConditionsFilters`. */
export function buildConditionsWhereClause(
  chainId?: number,
  filters?: ConditionFilter
): Record<string, unknown> {
  return buildConditionsFilters(chainId, filters);
}

export async function fetchConditionsPage(opts?: {
  take?: number;
  after?: string | null;
  chainId?: number;
  filters?: ConditionFilter;
}): Promise<ConnectionPage<ConditionType>> {
  const filters = buildConditionsFilters(opts?.chainId, opts?.filters);
  return fetchConnectionPage<ConditionType>(
    GET_CONDITIONS,
    {
      take: clampConnectionTake(opts?.take),
      after: opts?.after ?? null,
      filter: Object.keys(filters).length > 0 ? filters : undefined,
    },
    'conditionsConnection'
  );
}

/**
 * Single-page convenience wrapper. Use `fetchConditionsPage` when you
 * need `hasMore` / `endCursor` for paginating.
 */
export async function fetchConditions(opts?: {
  take?: number;
  after?: string | null;
  chainId?: number;
  filters?: ConditionFilter;
}): Promise<ConditionType[]> {
  return (await fetchConditionsPage(opts)).items;
}

const PAGE_SIZE = 100;
const MAX_CONCURRENT_REQUESTS = 3;

export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[],
  resultKey = 'conditionsConnection'
): Promise<T[]> {
  if (ids.length === 0) return [];

  const unwrap = (resp: unknown): T[] => {
    if (!resp || typeof resp !== 'object') return [];
    const r = resp as Record<string, unknown>;
    const page = r[resultKey];
    if (page && typeof page === 'object' && 'nodes' in page) {
      return ((page as { nodes: T[] }).nodes ?? []) as T[];
    }
    return (r[resultKey] as T[]) ?? [];
  };

  const runChunk = (chunk: string[]) =>
    graphqlRequest<Record<string, unknown>>(query, {
      filter: { ids: chunk },
    }).then(unwrap);

  if (ids.length <= PAGE_SIZE) return runChunk(ids);

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    chunks.push(ids.slice(i, i + PAGE_SIZE));
  }

  const results: T[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    results.push(...(await Promise.all(batch.map(runChunk))));
  }

  return results.flat();
}

type ConditionById = {
  id: string;
  conditionId: string;
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
  query ConditionsByIds($filter: ConditionFilter!) {
    conditionsConnection(filter: $filter, first: 100) {
      nodes {
        id: conditionId
        conditionId
        shortName
        optionName
        question
        description
        endTime
        resolver
        similarMarkets
        settled
        resolvedToYes
        nonDecisive
        estimatedPrice
        category {
          slug
        }
      }
    }
  }
`;

export async function fetchConditionsByIdsQuery(
  ids: string[]
): Promise<ConditionById[]> {
  return fetchConditionsByIds<ConditionById>(CONDITIONS_BY_IDS_QUERY, ids);
}

export type { ConditionById };
