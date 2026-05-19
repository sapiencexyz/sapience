import { graphqlRequest } from './client/graphqlClient';

export interface ConditionType {
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
  contractAddress?: string;
  contractAddressIn?: string[];
}

export type ConditionFilters = ConditionFilter;

const CONDITION_FIELDS = /* GraphQL */ `
  id
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
      hasMore
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
  if (filters?.contractAddress) out.contractAddress = filters.contractAddress;
  if (filters?.contractAddressIn?.length)
    out.contractAddressIn = filters.contractAddressIn;

  return out;
}

/** @deprecated Kept as a back-compat alias. Use `buildConditionsFilters`. */
export function buildConditionsWhereClause(
  chainId?: number,
  filters?: ConditionFilter
): Record<string, unknown> {
  return buildConditionsFilters(chainId, filters);
}

type ConditionsConnectionResult = {
  conditionsConnection?: {
    nodes?: ConditionType[] | null;
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
  } | null;
};

async function fetchConditionsWindow(
  first: number,
  skip: number,
  filter: Record<string, unknown> | undefined
): Promise<ConditionType[]> {
  const target = skip + first;
  const collected: ConditionType[] = [];
  let after: string | null | undefined = null;

  while (collected.length < target) {
    const batchSize = Math.min(100, target - collected.length);
    const data: ConditionsConnectionResult =
      await graphqlRequest<ConditionsConnectionResult>(GET_CONDITIONS, {
        take: batchSize,
        after,
        filter,
      });
    const conn = data.conditionsConnection;
    collected.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  return collected.slice(skip, target);
}

export async function fetchConditions(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilter;
}): Promise<ConditionType[]> {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const filters = buildConditionsFilters(opts?.chainId, opts?.filters);
  return fetchConditionsWindow(
    take,
    skip,
    Object.keys(filters).length > 0 ? filters : undefined
  );
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
    if (page && typeof page === 'object' && 'items' in page) {
      return ((page as { items: T[] }).items ?? []) as T[];
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
      hasMore
      nodes {
        id
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
