import { graphqlRequest } from './client/graphqlClient';

export interface ConditionGroupConditionType {
  /** CTF on-chain condition id (lowercase 0x-hex) — `conditionId`. */
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
  /** Opaque ConditionGroup id of the parent group. */
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
  /** Opaque ConditionGroup id — grouping identity only, not a row id. */
  id: string;
  createdAt: string;
  name: string;
  category?: { name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
  hasMoreConditions?: boolean;
  conditionsEndCursor?: string | null;
}

export interface ConditionGroupFilters {
  search?: string;
  categorySlugs?: string[];
  publicOnly?: boolean;
}

export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $first: Int
    $after: String
    $filter: ConditionGroupFilter
  ) {
    conditionGroups(
      first: $first
      after: $after
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
        conditions(first: 100) {
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
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CONDITION_GROUP_CONDITIONS_PAGE = /* GraphQL */ `
  query ConditionGroupConditions($id: ID!, $first: Int, $after: String) {
    conditionGroup(id: $id) {
      conditions(first: $first, after: $after) {
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
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/** The conditionGroups connection's max page size. */
const MAX_PAGE_SIZE = 100;

/**
 * Builds the `ConditionGroupFilter`. The filter only accepts `search` and a
 * SINGLE `categorySlug`; multi-slug selection and the nested public/chainId
 * condition filters are applied client-side in the mapper (the nested
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

type ConditionGroupConditionNode = {
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

type ConditionGroupNode = {
  id: string;
  createdAt: string;
  name: string;
  category?: { name: string; slug: string } | null;
  conditions?: {
    nodes?: ConditionGroupConditionNode[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

type ConditionGroupsResponse = {
  conditionGroups: {
    nodes: ConditionGroupNode[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ConditionGroupConditionsPageResponse = {
  conditionGroup: {
    conditions: {
      nodes: ConditionGroupConditionNode[];
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

function toGroupCondition(
  node: ConditionGroupConditionNode,
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
  nodes: ConditionGroupNode[],
  opts: {
    chainId?: number;
    filters?: ConditionGroupFilters;
    includeEmptyGroups: boolean;
  }
): ConditionGroupType[] {
  const { chainId, filters, includeEmptyGroups } = opts;
  const publicOnly = filters?.publicOnly ?? false;
  const slugs = filters?.categorySlugs ?? [];
  const hasNestedFilter = publicOnly || chainId !== undefined;

  return nodes
    .filter(
      // The ConditionGroupFilter accepts a single slug; for multi-slug OR
      // semantics we scan cursor pages and filter the accumulated rows here.
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
      // A group must contain at least one condition matching the
      // nested filters; truly empty groups survive only with
      // includeEmptyGroups and no nested filters.
      (group) =>
        group.conditions.length > 0 || (includeEmptyGroups && !hasNestedFilter)
    );
}

async function hydrateAllGroupConditions(
  group: ConditionGroupNode
): Promise<ConditionGroupNode> {
  const conditions = group.conditions;
  const nodes = [...(conditions?.nodes ?? [])];
  let pageInfo = conditions?.pageInfo;

  while (pageInfo?.hasNextPage && pageInfo.endCursor) {
    const data = await graphqlRequest<ConditionGroupConditionsPageResponse>(
      CONDITION_GROUP_CONDITIONS_PAGE,
      {
        id: group.id,
        first: MAX_PAGE_SIZE,
        after: pageInfo.endCursor,
      }
    );
    const page = data?.conditionGroup?.conditions;
    if (!page || !Array.isArray(page.nodes)) break;
    nodes.push(...page.nodes);
    pageInfo = page.pageInfo;
  }

  return {
    ...group,
    conditions: {
      nodes,
      pageInfo,
    },
  };
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

  const target = skip + take;
  const nodes: ConditionGroupNode[] = [];
  let after: string | null = null;

  while (true) {
    const mapped = toConditionGroupTypes(nodes, {
      chainId,
      filters,
      includeEmptyGroups,
    });
    if (mapped.length >= target) {
      return mapped.slice(skip, skip + take);
    }

    const data: ConditionGroupsResponse =
      await graphqlRequest<ConditionGroupsResponse>(GET_CONDITION_GROUPS, {
        first: Math.min(target - mapped.length, MAX_PAGE_SIZE),
        after,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
    const pageNodes = data?.conditionGroups?.nodes;
    if (!Array.isArray(pageNodes)) {
      throw new Error(
        'Failed to fetch condition groups: Invalid response structure'
      );
    }

    const hydrated = await Promise.all(
      pageNodes.map(hydrateAllGroupConditions)
    );
    nodes.push(...hydrated);

    const pageInfo = data.conditionGroups.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      return toConditionGroupTypes(nodes, {
        chainId,
        filters,
        includeEmptyGroups,
      }).slice(skip, skip + take);
    }
    after = pageInfo.endCursor;
  }
}
