import { graphqlRequest } from './client/graphqlClient';

export interface ConditionGroupConditionType {
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
  description: string;
  similarMarkets: string[];
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
  displayOrder?: number | null;
}

export interface ConditionGroupType {
  id: number;
  createdAt: string;
  name: string;
  category?: { id: number; name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
}

export interface ConditionGroupFilters {
  search?: string;
  categorySlugs?: string[];
  publicOnly?: boolean;
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

  if (opts?.filters?.search?.trim()) {
    const searchTerm = opts.filters.search.trim();
    andConditions.push({
      name: { contains: searchTerm, mode: 'insensitive' },
    });
  }

  if (opts?.filters?.categorySlugs && opts.filters.categorySlugs.length > 0) {
    andConditions.push({
      category: {
        is: {
          slug: { in: opts.filters.categorySlugs },
        },
      },
    });
  }

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

export async function fetchConditionGroups(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}): Promise<ConditionGroupType[]> {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmptyGroups = opts?.includeEmptyGroups ?? false;

  const where = buildGroupWhereClause({ chainId, filters, includeEmptyGroups });
  const conditionsWhere = buildConditionsWhereClause({ chainId, filters });

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
}
