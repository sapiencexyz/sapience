'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useSettings } from '~/lib/context/SettingsContext';

export type AdminConditionGroupCondition = {
  id: string;
  question: string;
  shortName: string | null;
  optionName: string | null;
  similarMarketVolume: number;
  displayOrder: number | null;
};

export type AdminConditionGroup = {
  id: number;
  name: string;
  negRisk: boolean;
  condition: AdminConditionGroupCondition[];
  hasMoreConditions: boolean;
};

const ADMIN_CONDITION_GROUPS_QUERY_KEY = ['admin', 'conditionGroups'] as const;

// This page targets the single GraphQL endpoint the app is configured with: the
// `graphqlEndpoint` setting that the "GraphQL Endpoint" Settings field and the
// Meridian env presets write, and that the SDK client reads for every app query
// (Sapience serves it at `/v2/graphql`, Meridian at `/graphql`, so it stores a
// full URL). Groups load from this endpoint unauthenticated, so the operator is
// never prompted to sign just to browse; only saving (the reorder mutation) is
// signed, and it derives the `/admin` REST base from the same origin so load and
// save can never drift to different backends. The ids line up with the REST
// surface: `Condition.conditionId` is the row primary key the reorder endpoint
// expects, and `ConditionGroup.groupId` is the numeric `:id` param.
function adminBaseFromGraphqlEndpoint(graphqlEndpoint: string): string {
  return `${new URL(graphqlEndpoint).origin}/admin`;
}

// Note: the GraphQL `conditions` connection only returns public conditions, so
// the reorder endpoint is intentionally partial — it reorders the ids we send
// and leaves any hidden condition's displayOrder untouched (never detaching).
const ADMIN_CONDITION_GROUPS_QUERY = `
  query AdminConditionGroups($first: Int!, $after: String) {
    conditionGroups(
      first: $first
      after: $after
      orderBy: { field: NAME, direction: ASC }
    ) {
      nodes {
        groupId
        name
        negRisk
        conditions(first: 100) {
          nodes {
            conditionId
            question
            shortName
            optionName
            displayOrder
            similarMarketVolume
          }
          pageInfo {
            hasNextPage
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

type GqlConditionNode = {
  conditionId: string;
  question: string;
  shortName: string | null;
  optionName: string | null;
  displayOrder: number | null;
  similarMarketVolume: number;
};

type GqlGroupNode = {
  groupId: number;
  name: string;
  negRisk: boolean;
  conditions: {
    nodes: GqlConditionNode[];
    pageInfo?: { hasNextPage: boolean };
  };
};

type AdminConditionGroupsResponse = {
  data?: {
    conditionGroups?: {
      nodes: GqlGroupNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: { message?: string }[];
};

// Safety cap on pagination: 20 * 100 = 2000 groups. Well above the real count.
const MAX_GROUP_PAGES = 20;

async function readErrorMessage(resp: Response): Promise<string> {
  const fallback = `Failed to load condition groups (${resp.status})`;
  const text = await resp.text().catch(() => '');
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as {
      errors?: { message?: string }[];
      message?: string;
      error?: string;
    };
    const message =
      parsed.errors?.[0]?.message ?? parsed.message ?? parsed.error ?? text;
    return `${fallback}: ${message}`;
  } catch {
    return `${fallback}: ${text}`;
  }
}

async function fetchAllConditionGroups(
  endpoint: string
): Promise<AdminConditionGroup[]> {
  const groups: AdminConditionGroup[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_GROUP_PAGES; page++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: ADMIN_CONDITION_GROUPS_QUERY,
        variables: { first: 100, after },
      }),
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp));
    }
    const json = (await resp.json()) as AdminConditionGroupsResponse;
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw new Error(json.errors[0]?.message ?? 'GraphQL error');
    }
    const connection = json.data?.conditionGroups;
    const nodes: GqlGroupNode[] = connection?.nodes ?? [];
    for (const node of nodes) {
      groups.push({
        id: node.groupId,
        name: node.name,
        negRisk: node.negRisk,
        hasMoreConditions: node.conditions?.pageInfo?.hasNextPage ?? false,
        condition: (node.conditions?.nodes ?? []).map((c) => ({
          id: c.conditionId,
          question: c.question,
          shortName: c.shortName,
          optionName: c.optionName,
          displayOrder: c.displayOrder,
          similarMarketVolume: c.similarMarketVolume,
        })),
      });
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return groups;
}

// Reads the public GraphQL endpoint — no signature. Still gated behind an
// explicit `enabled` flag so the request only fires once the page opts in.
export function useAdminConditionGroups(
  enabled: boolean
): UseQueryResult<AdminConditionGroup[]> {
  const { graphqlEndpoint } = useSettings();
  return useQuery({
    queryKey: [...ADMIN_CONDITION_GROUPS_QUERY_KEY, graphqlEndpoint],
    queryFn: () => fetchAllConditionGroups(graphqlEndpoint as string),
    enabled: enabled && Boolean(graphqlEndpoint),
  });
}

export type ReorderConditionGroupInput = {
  groupId: number;
  conditionIds: string[];
};

// The only signed call. Hits the admin endpoint that sets a group's conditions
// in display order. We always send the group's full public condition set (the
// UI's permutation guard enforces this), so it is a pure reorder. The endpoint
// scopes its membership clear to public conditions, so any hidden conditions in
// the group keep their group + displayOrder.
export function useReorderConditionGroup(): UseMutationResult<
  AdminConditionGroup,
  Error,
  ReorderConditionGroupInput
> {
  const { graphqlEndpoint } = useSettings();
  const adminBase = graphqlEndpoint
    ? adminBaseFromGraphqlEndpoint(graphqlEndpoint)
    : undefined;
  const { putJson } = useAdminApi(adminBase);
  const queryClient = useQueryClient();
  return useMutation<AdminConditionGroup, Error, ReorderConditionGroupInput>({
    mutationFn: ({ groupId, conditionIds }) =>
      putJson<AdminConditionGroup>(`/conditionGroups/${groupId}/conditions`, {
        conditionIds,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ADMIN_CONDITION_GROUPS_QUERY_KEY,
      });
    },
  });
}
