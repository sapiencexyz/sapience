/**
 * ConditionGroup type exports + a thin `fetchConditionGroupsByIds`
 * helper backed by `conditionGroupsPage`.
 *
 * The previous `GET_CONDITION_GROUPS` / `fetchConditionGroups` API
 * accepted free-text search, category slugs, chain filters, and
 * `includeEmptyGroups` — all expressed as Prisma `where:` clauses
 * against the deprecated `conditionGroups(where:)` field. None of
 * those options were exercised by any in-tree caller, and the
 * `conditionGroupsPage` filter input is intentionally minimal
 * (`ids` only). Callers that need richer filtering should fetch
 * conditions via `conditionsPage` and group client-side.
 */

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

export const GET_CONDITION_GROUPS_BY_IDS = /* GraphQL */ `
  query ConditionGroupsByIds($ids: [Int!], $take: Int! = 100) {
    conditionGroupsPage(filters: { ids: $ids }, take: $take) {
      items {
        id
        createdAt
        name
        category {
          id
          name
          slug
        }
        conditions {
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

export async function fetchConditionGroupsByIds(opts?: {
  ids?: number[];
  take?: number;
}): Promise<ConditionGroupType[]> {
  type Result = {
    conditionGroupsPage: { items: ConditionGroupType[]; hasMore: boolean };
  };
  const data = await graphqlRequest<Result>(GET_CONDITION_GROUPS_BY_IDS, {
    ids: opts?.ids,
    take: opts?.take ?? 100,
  });
  return data.conditionGroupsPage?.items ?? [];
}
