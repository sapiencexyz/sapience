import {
  clampConnectionTake,
  fetchConnectionPage,
  fetchConnectionWindow,
  shouldFetchConnectionWindow,
  type ConnectionPage,
} from './connectionPage';

export interface ConditionGroupConditionType {
  id: string;
  conditionId: string;
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

export interface ConditionGroupFilter {
  search?: string;
  categorySlugs?: string[];
  publicOnly?: boolean;
}

export type ConditionGroupFilters = ConditionGroupFilter;

export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int!
    $after: String
    $filter: ConditionGroupFilter
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroupsConnection(first: $take, after: $after, filter: $filter) {
      nodes {
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
          id: conditionId
          conditionId
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type ConditionGroupConnectionOptions = {
  chainId?: number;
  filters?: ConditionGroupFilter;
  includeEmptyGroups?: boolean;
};

function buildConditionGroupsVariables(
  opts: ConditionGroupConnectionOptions | undefined,
  take: number,
  after: string | null
) {
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmpty = opts?.includeEmptyGroups ?? false;
  const conditionsWhere =
    chainId !== undefined ? { chainId: { equals: chainId } } : undefined;
  const filter = {
    search: filters?.search,
    categorySlugs: filters?.categorySlugs,
    chainId,
    publicOnly: filters?.publicOnly === true,
    includeEmpty,
  };

  return {
    take,
    after,
    filter,
    conditionsWhere,
  };
}

export async function fetchConditionGroupsPage(opts?: {
  take?: number;
  after?: string | null;
  chainId?: number;
  filters?: ConditionGroupFilter;
  includeEmptyGroups?: boolean;
}): Promise<ConnectionPage<ConditionGroupType>> {
  return fetchConnectionPage<ConditionGroupType>(
    GET_CONDITION_GROUPS,
    buildConditionGroupsVariables(
      opts,
      clampConnectionTake(opts?.take, 100),
      opts?.after ?? null
    ),
    'conditionGroupsConnection'
  );
}

/**
 * Single-page convenience wrapper. Use `fetchConditionGroupsPage` when
 * you need `hasMore` / `endCursor` for paginating.
 */
export async function fetchConditionGroups(opts?: {
  take?: number;
  /** @deprecated Use `after` with `endCursor` from `fetchConditionGroupsPage`. */
  skip?: number;
  after?: string | null;
  chainId?: number;
  filters?: ConditionGroupFilter;
  includeEmptyGroups?: boolean;
}): Promise<ConditionGroupType[]> {
  if (shouldFetchConnectionWindow(opts?.take, opts?.skip, opts?.after, 100)) {
    const page = await fetchConnectionWindow<ConditionGroupType>(
      GET_CONDITION_GROUPS,
      (take, after) => buildConditionGroupsVariables(opts, take, after),
      'conditionGroupsConnection',
      {
        take: opts?.take,
        skip: opts?.skip,
        defaultTake: 100,
      }
    );
    return page.items;
  }

  return (await fetchConditionGroupsPage(opts)).items;
}
