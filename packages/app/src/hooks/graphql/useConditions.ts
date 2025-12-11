import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export interface ConditionType {
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
  claimStatement: string;
  description: string;
  similarMarkets: string[];
  chainId: number;
  category?: { id: number; name: string; slug: string } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  assertionId?: string;
  assertionTimestamp?: number;
  openInterest: string;
  conditionGroupId?: number | null;
}

// Filter options for backend filtering
export interface ConditionFilters {
  search?: string;
  categorySlugs?: string[];
  endTimeGte?: number; // Unix timestamp in seconds
  endTimeLte?: number; // Unix timestamp in seconds
  publicOnly?: boolean;
}

const GET_CONDITIONS = /* GraphQL */ `
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
      claimStatement
      description
      similarMarkets
      chainId
      settled
      resolvedToYes
      assertionId
      assertionTimestamp
      openInterest
      conditionGroupId
      category {
        id
        name
        slug
      }
    }
  }
`;

function buildWhereClause(
  chainId?: number,
  filters?: ConditionFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  // Chain ID filter
  if (chainId !== undefined) {
    andConditions.push({ chainId: { equals: chainId } });
  }

  // Public only filter
  if (filters?.publicOnly) {
    andConditions.push({ public: { equals: true } });
  }

  // Search filter - search across question, shortName, description, claimStatement
  if (filters?.search?.trim()) {
    const searchTerm = filters.search.trim();
    andConditions.push({
      OR: [
        { question: { contains: searchTerm, mode: 'insensitive' } },
        { shortName: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { claimStatement: { contains: searchTerm, mode: 'insensitive' } },
      ],
    });
  }

  // Category filter by slugs
  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    andConditions.push({
      category: {
        is: {
          slug: { in: filters.categorySlugs },
        },
      },
    });
  }

  // End time range filter
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

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export const useConditions = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilters;
}) => {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;

  // Build where clause
  const where = buildWhereClause(chainId, filters);

  return useQuery<ConditionType[], Error>({
    queryKey: ['conditions', take, skip, chainId, filters],
    queryFn: async (): Promise<ConditionType[]> => {
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
    },
  });
};
