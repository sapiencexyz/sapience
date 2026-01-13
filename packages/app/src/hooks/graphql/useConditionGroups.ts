import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export interface ConditionGroupConditionType {
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
  displayOrder?: number | null;
}

export interface ConditionGroupType {
  id: number;
  createdAt: string;
  name: string;
  category?: { id: number; name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
}

// Filter options for backend filtering of groups.
// Note: group-level filtering can only target group fields and relations.
export interface ConditionGroupFilters {
  search?: string; // searches group name
  categorySlugs?: string[];
  publicOnly?: boolean; // only groups with at least one public condition
}

const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int
    $skip: Int
    $where: ConditionGroupWhereInput
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroups(
      orderBy: [{ createdAt: desc }]
      take: $take
      skip: $skip
      where: $where
    ) {
      id
      createdAt
      name
      category {
        id
        name
        slug
      }
      conditions(
        orderBy: [{ displayOrder: { sort: asc } }]
        where: $conditionsWhere
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
        displayOrder
      }
    }
  }
`;

function buildGroupWhereClause(opts?: {
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  // Search filter - group name only
  if (opts?.filters?.search?.trim()) {
    const searchTerm = opts.filters.search.trim();
    andConditions.push({
      name: { contains: searchTerm, mode: 'insensitive' },
    });
  }

  // Category filter by slugs
  if (opts?.filters?.categorySlugs && opts.filters.categorySlugs.length > 0) {
    andConditions.push({
      category: {
        is: {
          slug: { in: opts.filters.categorySlugs },
        },
      },
    });
  }

  // Ensure group rows have at least one relevant condition.
  //
  // Important: combine constraints into a single `some` clause so we don't return
  // groups that pass (e.g. has a public condition on a different chain) but then
  // fetch zero child conditions due to `$conditionsWhere`.
  const conditionSomeAnd: Record<string, unknown>[] = [];
  if (opts?.filters?.publicOnly) {
    conditionSomeAnd.push({ public: { equals: true } });
  }
  if (opts?.chainId !== undefined) {
    conditionSomeAnd.push({ chainId: { equals: opts.chainId } });
  }

  const shouldRequireSomeCondition =
    !opts?.includeEmptyGroups || conditionSomeAnd.length > 0;

  if (shouldRequireSomeCondition) {
    andConditions.push({
      conditions: {
        some: conditionSomeAnd.length > 0 ? { AND: conditionSomeAnd } : {},
      },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

function buildConditionsWhereClause(opts?: {
  chainId?: number;
  filters?: ConditionGroupFilters;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (opts?.chainId !== undefined) {
    andConditions.push({ chainId: { equals: opts.chainId } });
  }

  if (opts?.filters?.publicOnly) {
    andConditions.push({ public: { equals: true } });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export const useConditionGroups = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}) => {
  const take = opts?.take;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmptyGroups = opts?.includeEmptyGroups ?? false;

  const where = buildGroupWhereClause({ chainId, filters, includeEmptyGroups });
  const conditionsWhere = buildConditionsWhereClause({ chainId, filters });

  return useQuery<ConditionGroupType[], Error>({
    queryKey: [
      'conditionGroups',
      take,
      skip,
      chainId,
      filters,
      includeEmptyGroups,
    ],
    queryFn: async (): Promise<ConditionGroupType[]> => {
      type ConditionGroupsQueryResult = {
        conditionGroups: ConditionGroupType[];
      };
      const variables = {
        take,
        skip,
        where: Object.keys(where).length > 0 ? where : undefined,
        conditionsWhere:
          Object.keys(conditionsWhere).length > 0 ? conditionsWhere : undefined,
      };

      const data = await graphqlRequest<ConditionGroupsQueryResult>(
        GET_CONDITION_GROUPS,
        variables
      );

      return data.conditionGroups ?? [];
    },
  });
};
