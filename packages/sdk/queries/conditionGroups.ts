import { graphqlRequest } from './client/graphqlClient';

export interface ConditionGroupConditionType {
  /** CTF on-chain condition id (lowercase 0x-hex) — v2 `conditionId`. */
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
  category?: { name: string; slug: string } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  openInterest: string;
  similarMarketVolume?: number;
  similarMarketImage?: string | null;
  /** Opaque v2 ConditionGroup id of the parent group. */
  conditionGroupId?: string | null;
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
  /** Opaque v2 ConditionGroup id — grouping identity only, not a row id. */
  id: string;
  createdAt: string;
  name: string;
  category?: { name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
}

export interface ConditionGroupFilters {
  search?: string;
  categorySlugs?: string[];
  publicOnly?: boolean;
}

export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups($first: Int, $filter: ConditionGroupFilter) {
    conditionGroups(
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: $filter
    ) {
      nodes {
        id
        createdAt
        name
        category {
          name
          slug
        }
        conditions(first: 50) {
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
            displayOrder
            category {
              name
              slug
            }
          }
        }
      }
    }
  }
`;

/** v2 maxTake for the conditionGroups connection. */
const V2_MAX_FIRST = 100;

/**
 * Builds the v2 `ConditionGroupFilter`. v2 only accepts `search` and a
 * SINGLE `categorySlug`; multi-slug selection and the nested public/chainId
 * condition filters are applied client-side in the mapper (the v2 nested
 * conditions connection has no filter argument).
 */
function buildConditionGroupFilter(
  filters?: ConditionGroupFilters
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (filters?.search?.trim()) {
    filter.search = filters.search.trim();
  }

  if (filters?.categorySlugs?.length === 1) {
    filter.categorySlug = filters.categorySlugs[0];
  }

  return filter;
}

type ConditionGroupConditionV2Node = {
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
  displayOrder?: number | null;
  category?: { name: string; slug: string } | null;
};

type ConditionGroupV2Node = {
  id: string;
  createdAt: string;
  name: string;
  category?: { name: string; slug: string } | null;
  conditions?: { nodes?: ConditionGroupConditionV2Node[] } | null;
};

type ConditionGroupsV2Response = {
  conditionGroups: { nodes: ConditionGroupV2Node[] };
};

function toGroupCondition(
  node: ConditionGroupConditionV2Node,
  groupId: string
): ConditionGroupConditionType {
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
    conditionGroupId: groupId,
    displayOrder: node.displayOrder ?? null,
    category: node.category
      ? { name: node.category.name, slug: node.category.slug }
      : null,
  };
}

function toConditionGroupTypes(
  data: ConditionGroupsV2Response | null,
  opts: {
    chainId?: number;
    filters?: ConditionGroupFilters;
    includeEmptyGroups: boolean;
  }
): ConditionGroupType[] {
  const nodes = data?.conditionGroups?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(
      'Failed to fetch condition groups: Invalid response structure'
    );
  }

  const { chainId, filters, includeEmptyGroups } = opts;
  const publicOnly = filters?.publicOnly ?? false;
  const slugs = filters?.categorySlugs ?? [];
  const hasNestedFilter = publicOnly || chainId !== undefined;

  return nodes
    .filter(
      // v2's ConditionGroupFilter accepts a single slug; the multi-slug OR
      // semantics from v1 are preserved client-side over the fetched page.
      (group) =>
        slugs.length < 2 ||
        (group.category != null && slugs.includes(group.category.slug))
    )
    .map((group) => ({
      id: group.id,
      createdAt: group.createdAt,
      name: group.name,
      category: group.category
        ? { name: group.category.name, slug: group.category.slug }
        : null,
      conditions: (group.conditions?.nodes ?? [])
        .filter(
          (c) =>
            (chainId === undefined || c.chainId === chainId) &&
            (!publicOnly || c.isPublic)
        )
        .map((c) => toGroupCondition(c, group.id)),
    }))
    .filter(
      // v1 parity: a group must contain at least one condition matching the
      // nested filters; truly empty groups survive only with
      // includeEmptyGroups and no nested filters.
      (group) =>
        group.conditions.length > 0 || (includeEmptyGroups && !hasNestedFilter)
    );
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

  const filter = buildConditionGroupFilter(filters);

  // v2 connections cursor-paginate; emulate the v1 offset contract by
  // over-fetching (capped at the server's maxTake) and slicing locally.
  const first = Math.min(take + skip, V2_MAX_FIRST);

  const data = await graphqlRequest<ConditionGroupsV2Response>(
    GET_CONDITION_GROUPS,
    {
      first,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }
  );

  return toConditionGroupTypes(data, {
    chainId,
    filters,
    includeEmptyGroups,
  }).slice(skip, skip + take);
}
