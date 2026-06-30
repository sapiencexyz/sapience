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
  /** Numeric DB id — REST `:id` param for reorder. */
  id: number;
  /** Relay global id — `conditionGroup(id:)` for cursor hydration. */
  globalId: string;
  name: string;
  negRisk: boolean;
  condition: AdminConditionGroupCondition[];
  /** True when the list query's first nested page reported more conditions. */
  hasMoreConditions: boolean;
};

const ADMIN_CONDITION_GROUPS_QUERY_KEY = ['admin', 'conditionGroups'] as const;
const ADMIN_GROUP_CONDITIONS_QUERY_KEY = [
  'admin',
  'conditionGroupConditions',
] as const;

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

const ADMIN_CONDITION_GROUPS_QUERY = `
  query AdminConditionGroups($first: Int!, $after: String) {
    conditionGroups(
      first: $first
      after: $after
      orderBy: { field: NAME, direction: ASC }
    ) {
      nodes {
        id
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

const ADMIN_GROUP_CONDITIONS_QUERY = `
  query AdminGroupConditions($id: ID!, $first: Int!, $after: String) {
    conditionGroup(id: $id) {
      conditions(first: $first, after: $after) {
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
          endCursor
        }
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
  id: string;
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

type AdminGroupConditionsResponse = {
  data?: {
    conditionGroup?: {
      conditions?: {
        nodes: GqlConditionNode[];
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  };
  errors?: { message?: string }[];
};

// Safety cap on pagination: 20 * 100 = 2000 groups. Well above the real count.
const MAX_GROUP_PAGES = 20;
const MAX_CONDITION_PAGE_SIZE = 100;
// 50 * 100 = 5000 public conditions per group — admin safety cap.
const MAX_CONDITION_PAGES = 50;

function mapConditionNode(
  node: GqlConditionNode
): AdminConditionGroupCondition {
  return {
    id: node.conditionId,
    question: node.question,
    shortName: node.shortName,
    optionName: node.optionName,
    displayOrder: node.displayOrder,
    similarMarketVolume: node.similarMarketVolume,
  };
}

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

async function graphqlPost<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp));
  }
  const json = (await resp.json()) as T & { errors?: { message?: string }[] };
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  }
  return json;
}

/** Cursor-paginates every public condition on a group (for reorder save). */
export async function fetchAllGroupConditions(
  endpoint: string,
  globalId: string
): Promise<AdminConditionGroupCondition[]> {
  const conditions: AdminConditionGroupCondition[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_CONDITION_PAGES; page++) {
    const json: AdminGroupConditionsResponse =
      await graphqlPost<AdminGroupConditionsResponse>(
        endpoint,
        ADMIN_GROUP_CONDITIONS_QUERY,
        { id: globalId, first: MAX_CONDITION_PAGE_SIZE, after }
      );
    const connection = json.data?.conditionGroup?.conditions;
    const nodes = connection?.nodes ?? [];
    conditions.push(...nodes.map(mapConditionNode));

    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return conditions;
}

async function fetchAllConditionGroups(
  endpoint: string
): Promise<AdminConditionGroup[]> {
  const groups: AdminConditionGroup[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_GROUP_PAGES; page++) {
    const json: AdminConditionGroupsResponse =
      await graphqlPost<AdminConditionGroupsResponse>(
        endpoint,
        ADMIN_CONDITION_GROUPS_QUERY,
        { first: 100, after }
      );
    const connection = json.data?.conditionGroups;
    const nodes: GqlGroupNode[] = connection?.nodes ?? [];
    for (const node of nodes) {
      groups.push({
        id: node.groupId,
        globalId: node.id,
        name: node.name,
        negRisk: node.negRisk,
        hasMoreConditions: node.conditions?.pageInfo?.hasNextPage ?? false,
        condition: (node.conditions?.nodes ?? []).map(mapConditionNode),
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

/** Hydrates every public condition for one group via cursor pagination. */
export function useAdminGroupConditions(
  globalId: string | null | undefined,
  enabled: boolean
): UseQueryResult<AdminConditionGroupCondition[]> {
  const { graphqlEndpoint } = useSettings();
  return useQuery({
    queryKey: [...ADMIN_GROUP_CONDITIONS_QUERY_KEY, graphqlEndpoint, globalId],
    queryFn: () =>
      fetchAllGroupConditions(graphqlEndpoint as string, globalId as string),
    enabled: enabled && Boolean(graphqlEndpoint) && Boolean(globalId),
  });
}

export type ReorderConditionGroupInput = {
  groupId: number;
  conditionIds: string[];
};

// The only signed call. Hits the admin endpoint that sets a group's conditions
// in display order. The UI hydrates the full public set via cursor before save
// and the permutation guard enforces a pure reorder of that set.
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
      void queryClient.invalidateQueries({
        queryKey: ADMIN_GROUP_CONDITIONS_QUERY_KEY,
      });
    },
  });
}
