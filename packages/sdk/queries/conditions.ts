import { graphqlRequest } from './client/graphqlClient';

export interface ConditionType {
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
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
  conditionGroupId?: number | null;
  conditionGroup?: { id: number; name: string } | null;
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
  query Conditions($take: Int, $skip: Int, $where: ConditionWhereInput) {
    conditions(
      orderBy: { createdAt: desc }
      take: $take
      skip: $skip
      where: $where
    ) {
      id
      createdAt
      question
      shortName
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
`;

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
  const where = buildConditionsWhereClause(opts?.chainId, opts?.filters);

  type ConditionsQueryResult = { conditions: ConditionType[] };
  const variables = {
    take,
    skip,
    where: Object.keys(where).length > 0 ? where : undefined,
  };

  const data = await graphqlRequest<ConditionsQueryResult>(
    GET_CONDITIONS,
    variables
  );

  return data.conditions ?? [];
}

// --- fetchConditionsByIds ---

const PAGE_SIZE = 100;
const MAX_CONCURRENT_REQUESTS = 3;

export async function fetchConditionsByIds<T>(
  query: string,
  ids: string[],
  resultKey = 'conditions'
): Promise<T[]> {
  if (ids.length === 0) return [];
  if (ids.length <= PAGE_SIZE) {
    const resp = await graphqlRequest<Record<string, T[]>>(query, {
      where: { id: { in: ids } },
    });
    return resp?.[resultKey] ?? [];
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
        graphqlRequest<Record<string, T[]>>(query, {
          where: { id: { in: chunk } },
        })
      )
    );
    results.push(...batchResults.map((r) => r?.[resultKey] ?? []));
  }

  return results.flat();
}

// --- fetchConditionsByIdsQuery (for useConditionsByIds) ---

type ConditionById = {
  id: string;
  shortName?: string | null;
  question?: string | null;
  description?: string | null;
  endTime?: number | null;
  resolver?: string | null;
  similarMarkets?: string[];
  category?: { slug?: string | null } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
};

const CONDITIONS_BY_IDS_QUERY = /* GraphQL */ `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      shortName
      question
      description
      endTime
      resolver
      similarMarkets
      settled
      resolvedToYes
      nonDecisive
      category {
        slug
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
