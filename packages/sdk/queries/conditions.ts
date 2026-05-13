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

export interface ConditionFilters {
  search?: string;
  categorySlugs?: string[];
  endTimeGte?: number;
  endTimeLte?: number;
  publicOnly?: boolean;
  ungroupedOnly?: boolean;
  visibility?: 'all' | 'public' | 'private';
}

export const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($take: Int, $skip: Int, $filters: ConditionFilters) {
    conditionsPage(
      orderBy: CREATED_AT
      orderDirection: desc
      take: $take
      skip: $skip
      filters: $filters
    ) {
      items {
        id
        createdAt
        question
        shortName
        optionName
        endTime
        public
        description
        similarMarkets
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
      }
    }
  }
`;

/**
 * Build a flat `ConditionFilters` input for the `conditionsPage` query.
 * Replaces the old Prisma-style WhereInput builder.
 */
export function buildConditionsFilters(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (chainId !== undefined) {
    out.chainId = chainId;
  }

  if (filters?.visibility === 'all') {
    out.visibility = 'ALL';
  } else if (filters?.visibility === 'private') {
    out.visibility = 'PRIVATE';
  } else if (filters?.visibility === 'public' || filters?.publicOnly) {
    out.visibility = 'PUBLIC';
  }

  if (filters?.search?.trim()) {
    out.search = filters.search.trim();
  }

  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    out.categorySlugs = filters.categorySlugs;
  }

  if (filters?.endTimeGte !== undefined) {
    out.minEndTime = filters.endTimeGte;
  }
  if (filters?.endTimeLte !== undefined) {
    out.maxEndTime = filters.endTimeLte;
  }

  if (filters?.ungroupedOnly) {
    out.ungroupedOnly = true;
  }

  return out;
}

/**
 * @deprecated Kept as a back-compat alias. Use `buildConditionsFilters`.
 */
export function buildConditionsWhereClause(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> {
  return buildConditionsFilters(chainId, filters);
}

export async function fetchConditions(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilters;
}): Promise<ConditionType[]> {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const filters = buildConditionsFilters(opts?.chainId, opts?.filters);

  type ConditionsQueryResult = {
    conditionsPage: { items: ConditionType[] };
  };
  const variables = {
    take,
    skip,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };

  const data = await graphqlRequest<ConditionsQueryResult>(
    GET_CONDITIONS,
    variables
  );

  return data.conditionsPage?.items ?? [];
}

// --- fetchConditionsByIds ---

const PAGE_SIZE = 100;
const MAX_CONCURRENT_REQUESTS = 3;

/**
 * Fetch conditions by ID set, using a query that selects from
 * `conditionsPage { items { ... } }` and accepts a `$filters: ConditionFilters`.
 *
 * Note: the resultKey parameter is kept for backward compatibility but
 * the caller's query must select via `conditionsPage`; results are unwrapped
 * from `items` automatically.
 */
export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[],
  resultKey = 'conditionsPage'
): Promise<T[]> {
  if (ids.length === 0) return [];

  const unwrap = (resp: unknown): T[] => {
    if (!resp || typeof resp !== 'object') return [];
    const r = resp as Record<string, unknown>;
    const page = r[resultKey];
    if (page && typeof page === 'object' && 'items' in page) {
      return ((page as { items: T[] }).items ?? []) as T[];
    }
    // Back-compat: caller passed a bare-array query key
    return (r[resultKey] as T[]) ?? [];
  };

  if (ids.length <= PAGE_SIZE) {
    const resp = await graphqlRequest<Record<string, unknown>>(query, {
      filters: { ids },
    });
    return unwrap(resp);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    chunks.push(ids.slice(i, i + PAGE_SIZE));
  }

  const results: T[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const batchResults = await Promise.all(
      batch.map((chunk) =>
        graphqlRequest<Record<string, unknown>>(query, {
          filters: { ids: chunk },
        })
      )
    );
    results.push(...batchResults.map((r) => unwrap(r)));
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
  query ConditionsByIds($filters: ConditionFilters!) {
    conditionsPage(filters: $filters, take: 100) {
      items {
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
