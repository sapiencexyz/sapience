import { graphqlRequest } from './client/graphqlClient';

export interface ConditionGroupConditionType {
  id: string;
  createdAt: string;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
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
  similarMarketVolume?: number;
  similarMarketImage?: string | null;
  conditionGroupId?: number | null;
  displayOrder?: number | null;
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

/**
 * Top-level `conditionGroupsPage` exposes only `ids` as a filter today,
 * so chain/public/search/category are applied client-side after fetch.
 * The nested `ConditionGroup.conditions` field still accepts a
 * Prisma-style `where` clause, which we use to narrow per-group rows by
 * `chainId` (and optionally `public`).
 */
export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int
    $skip: Int
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroupsPage(take: $take, skip: $skip) {
      items {
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
          category {
            id
            name
            slug
          }
          displayOrder
        }
      }
    }
  }
`;

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

function passesGroupFilters(
  group: ConditionGroupType,
  filters?: ConditionGroupFilters
): boolean {
  if (filters?.search?.trim()) {
    const needle = filters.search.trim().toLowerCase();
    if (!group.name?.toLowerCase().includes(needle)) return false;
  }
  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    const slug = group.category?.slug;
    if (!slug || !filters.categorySlugs.includes(slug)) return false;
  }
  return true;
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

  const conditionsWhere = buildConditionsWhereClause({ chainId, filters });

  type ConditionGroupsQueryResult = {
    conditionGroupsPage: { items: ConditionGroupType[] };
  };
  const variables = {
    take,
    skip,
    conditionsWhere:
      Object.keys(conditionsWhere).length > 0 ? conditionsWhere : undefined,
  };

  const data = await graphqlRequest<ConditionGroupsQueryResult>(
    GET_CONDITION_GROUPS,
    variables
  );

  const groups = data.conditionGroupsPage?.items ?? [];

  // Apply name/category filters client-side (no server-side support yet).
  return groups.filter((group) => {
    if (!passesGroupFilters(group, filters)) return false;
    if (!includeEmptyGroups && (group.conditions ?? []).length === 0) {
      return false;
    }
    return true;
  });
}
