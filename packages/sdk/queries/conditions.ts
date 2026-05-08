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
  query Conditions(
    $take: Int! = 50
    $skip: Int! = 0
    $filters: ConditionFilters
  ) {
    conditionsPage(
      orderBy: CREATED_AT
      orderDirection: desc
      take: $take
      skip: $skip
      filters: $filters
    ) {
      hasMore
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
 * Map SDK-side `ConditionFilters` to the GraphQL `ConditionFilters` input
 * shape on the API. The two diverged historically — this hides that.
 */
export function buildConditionsFiltersInput(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  if (chainId !== undefined) out.chainId = chainId;

  if (filters?.visibility) {
    out.visibility = filters.visibility.toUpperCase();
  } else if (filters?.publicOnly) {
    out.visibility = 'PUBLIC';
  }

  if (filters?.search?.trim()) out.search = filters.search.trim();
  if (filters?.categorySlugs?.length) out.categorySlugs = filters.categorySlugs;
  if (filters?.endTimeGte !== undefined) out.endTimeGte = filters.endTimeGte;
  if (filters?.endTimeLte !== undefined) out.endTimeLte = filters.endTimeLte;
  if (filters?.ungroupedOnly) out.ungroupedOnly = true;

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * @deprecated Use `buildConditionsFiltersInput` — the new API takes a flat
 * `ConditionFilters` input rather than a Prisma-derived `ConditionWhereInput`.
 * Retained as a thin shim; will be removed alongside the deprecated
 * `conditions(where: ...)` wire field.
 */
export function buildConditionsWhereClause(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (chainId !== undefined) {
    andConditions.push({ chainId: { equals: chainId } });
  }

  if (filters?.visibility === 'all') {
    andConditions.push({
      OR: [{ public: { equals: true } }, { public: { equals: false } }],
    });
  } else if (filters?.visibility === 'private') {
    andConditions.push({ public: { equals: false } });
  } else if (filters?.visibility === 'public' || filters?.publicOnly) {
    andConditions.push({ public: { equals: true } });
  }

  if (filters?.search?.trim()) {
    const searchTerm = filters.search.trim();
    andConditions.push({
      OR: [
        { question: { contains: searchTerm, mode: 'insensitive' } },
        { shortName: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ],
    });
  }

  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    andConditions.push({
      category: {
        is: {
          slug: { in: filters.categorySlugs },
        },
      },
    });
  }

  if (filters?.endTimeGte !== undefined || filters?.endTimeLte !== undefined) {
    const endTimeFilter: Record<string, number> = {};
    if (filters.endTimeGte !== undefined) {
      endTimeFilter.gte = filters.endTimeGte;
    }
    if (filters.endTimeLte !== undefined) {
      endTimeFilter.lte = filters.endTimeLte;
    }
    andConditions.push({ endTime: endTimeFilter });
  }

  if (filters?.ungroupedOnly) {
    andConditions.push({ conditionGroupId: { equals: null } });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export async function fetchConditions(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilters;
}): Promise<ConditionType[]> {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const filters = buildConditionsFiltersInput(opts?.chainId, opts?.filters);

  type ConditionsQueryResult = {
    conditionsPage: { items: ConditionType[]; hasMore: boolean };
  };
  const data = await graphqlRequest<ConditionsQueryResult>(GET_CONDITIONS, {
    take,
    skip,
    filters,
  });

  return data.conditionsPage?.items ?? [];
}

// --- fetchConditionsByIds ---

const PAGE_SIZE = 100;
const MAX_CONCURRENT_REQUESTS = 3;

type IdsBatchResponse<T> = {
  conditionsPage?: { items: T[]; hasMore: boolean };
};

const fetchIdsChunk = async <T>(query: string, ids: string[]): Promise<T[]> => {
  const resp = await graphqlRequest<IdsBatchResponse<T>>(query, {
    filters: { ids, visibility: 'ALL' },
    take: PAGE_SIZE,
  });
  return resp?.conditionsPage?.items ?? [];
};

export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[]
): Promise<T[]> {
  if (ids.length === 0) return [];
  if (ids.length <= PAGE_SIZE) {
    return fetchIdsChunk<T>(query, ids);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    chunks.push(ids.slice(i, i + PAGE_SIZE));
  }

  const results: T[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const batchResults = await Promise.all(
      batch.map((chunk) => fetchIdsChunk<T>(query, chunk))
    );
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
  query ConditionsByIds($filters: ConditionFilters, $take: Int! = 100) {
    conditionsPage(filters: $filters, take: $take) {
      hasMore
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
