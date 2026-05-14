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

export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int!
    $skip: Int!
    $filters: ConditionGroupFilters
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroupsPage(take: $take, skip: $skip, filters: $filters) {
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
      hasMore
    }
  }
`;

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
  const includeEmpty = opts?.includeEmptyGroups ?? false;

  // The top-level filter prunes the page server-side (search, category,
  // chain, public, non-empty). The nested `conditions(where:)` selection
  // still narrows which Condition rows we show inside each group — we
  // ask the server only for the chain we care about so the UI doesn't
  // have to filter the inner list.
  const conditionsWhere =
    chainId !== undefined ? { chainId: { equals: chainId } } : undefined;

  type ConditionGroupsQueryResult = {
    conditionGroupsPage: { items: ConditionGroupType[]; hasMore: boolean };
  };
  const data = await graphqlRequest<ConditionGroupsQueryResult>(
    GET_CONDITION_GROUPS,
    {
      take,
      skip,
      filters: {
        search: filters?.search,
        categorySlugs: filters?.categorySlugs,
        chainId,
        publicOnly: filters?.publicOnly === true,
        includeEmpty,
      },
      conditionsWhere,
    }
  );

  return data.conditionGroupsPage?.items ?? [];
}
