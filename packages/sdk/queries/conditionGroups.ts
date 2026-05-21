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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type ConditionGroupsQueryResult = {
  conditionGroupsConnection?: {
    nodes?: ConditionGroupType[] | null;
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
  } | null;
};

export async function fetchConditionGroups(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionGroupFilter;
  includeEmptyGroups?: boolean;
}): Promise<ConditionGroupType[]> {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;
  const target = skip + take;
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

  const collected: ConditionGroupType[] = [];
  let after: string | null | undefined = null;
  while (collected.length < target) {
    const first = Math.min(100, target - collected.length);
    const data: ConditionGroupsQueryResult =
      await graphqlRequest<ConditionGroupsQueryResult>(GET_CONDITION_GROUPS, {
        take: first,
        after,
        filter,
        conditionsWhere,
      });
    const conn = data.conditionGroupsConnection;
    collected.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  return collected.slice(skip, target);
}
