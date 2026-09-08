'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { graphqlRequest } from '~/lib/sdk/queries/client/graphqlClient';
import {
  PREDICTION_FIELDS,
  toPrediction,
  type Prediction,
  type PredictionNode,
  type PickConfigData,
} from '~/hooks/graphql/usePositions';
import type { SecondaryTrade } from '~/hooks/graphql/useSecondaryTrades';
import {
  PICK_CONFIGURATION_FIELDS,
  toPickConfigData,
  type PickConfigurationNode,
} from '~/lib/adapters/pickConfig';

export type PredictionActivity = {
  type: 'prediction';
  timestamp: number;
  prediction: Prediction;
  pickConfig: PickConfigData | null;
  isPredictorSide: boolean;
};

export type TradeActivity = {
  type: 'trade';
  timestamp: number;
  trade: SecondaryTrade;
  pickConfig: PickConfigData | null;
  isBuyer: boolean;
};

export type ActivityItem = PredictionActivity | TradeActivity;

// The endpoint returns the Prediction | Trade union directly under
// `edges { node }` — the old `accountActivity` envelope (with its
// per-type `prediction` / `trade` wrappers and double query) is gone.
// `edges { timestamp }` (epoch seconds) is the interleave sort key for
// BOTH types; using it as the single source of time kills the old
// mixed-units bug (trades in seconds vs predictions in ISO strings).
export const ACCOUNT_ACTIVITY_QUERY = `
  query AccountActivity(
    $account: Address
    $conditionIds: [Bytes!]
    $pickConfigId: Bytes32
    $token: Address
    $types: [ActivityType!]
    $first: Int!
    $after: String
  ) {
    activity(
      first: $first
      after: $after
      filter: {
        account: $account
        conditionIds: $conditionIds
        pickConfigId: $pickConfigId
        token: $token
        types: $types
      }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        timestamp
        node {
          __typename
          ... on Prediction {
            ${PREDICTION_FIELDS}
          }
          ... on Trade {
            tradeHash
            chainId
            token
            collateral
            seller
            buyer
            tokenAmount
            price
            txHash
            blockNumber
            executedAt
            pickConfig {
              ${PICK_CONFIGURATION_FIELDS}
            }
          }
        }
      }
    }
  }
`;

/** Wire shape of a Trade in the activity union (BigInt scalars may
 *  arrive as numbers). */
type TradeActivityNode = {
  __typename: 'Trade';
  tradeHash: string;
  chainId: number;
  token: string;
  collateral: string;
  seller: string;
  buyer: string;
  tokenAmount: string | number;
  price: string | number;
  txHash: string;
  blockNumber: number;
  executedAt: number;
  pickConfig?: PickConfigurationNode | null;
};

type PredictionActivityNode = PredictionNode & {
  __typename: 'Prediction';
};

type ActivityEdge = {
  /** Interleave sort key: `Trade.executedAt` for trades, epoch seconds of
   *  `Prediction.createdAt` for predictions. */
  timestamp: number;
  node: PredictionActivityNode | TradeActivityNode;
};

type ActivityConnection = {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: ActivityEdge[];
};

const EMPTY_ACTIVITY_PAGE: ActivityConnection = {
  totalCount: 0,
  pageInfo: { hasNextPage: false, endCursor: null },
  edges: [],
};

/**
 * Pure mapper: one activity edge → the hook's item envelope. The edge's
 * `timestamp` (epoch seconds) is THE time for every item type (×1000 for
 * ms); pickConfigs map through the shared adapter.
 */
function toActivityItem(
  edge: ActivityEdge,
  account?: string
): ActivityItem | null {
  const timestampMs = edge.timestamp * 1000;
  const { node } = edge;

  if (node.__typename === 'Prediction') {
    const prediction = toPrediction(node);
    return {
      type: 'prediction',
      timestamp: timestampMs,
      prediction,
      pickConfig: prediction.pickConfig ?? null,
      isPredictorSide: account
        ? prediction.predictor.toLowerCase() === account.toLowerCase()
        : true,
    };
  }

  if (node.__typename === 'Trade') {
    return {
      type: 'trade',
      timestamp: timestampMs,
      trade: {
        tradeHash: node.tradeHash,
        chainId: node.chainId,
        token: node.token,
        collateral: node.collateral,
        seller: node.seller,
        buyer: node.buyer,
        tokenAmount: String(node.tokenAmount),
        price: String(node.price),
        txHash: node.txHash,
        blockNumber: node.blockNumber,
        executedAt: node.executedAt,
      },
      pickConfig: node.pickConfig ? toPickConfigData(node.pickConfig) : null,
      isBuyer: account
        ? node.buyer.toLowerCase() === account.toLowerCase()
        : false,
    };
  }

  return null;
}

/** Stable domain identity for an item — used for dedup across pages and for
 *  diffing the live feed against what's already on screen. */
function itemKey(item: ActivityItem): string {
  return item.type === 'prediction'
    ? `Prediction:${item.prediction.predictionId}`
    : `Trade:${item.trade.tradeHash}`;
}

/** Map a connection's edges to typed items, deduping on the domain id. */
function mapEdges(
  edges: ActivityEdge[] | undefined,
  account?: string
): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const edge of edges ?? []) {
    const item = toActivityItem(edge, account);
    if (!item) continue;
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_LIVE_INTERVAL_MS = 20_000;

export function useAccountActivity({
  account,
  pageSize = DEFAULT_PAGE_SIZE,
  activityType,
  pickConfigId,
  token,
  conditionId,
  enabled: enabledOverride,
  enableLive = false,
  liveIntervalMs = DEFAULT_LIVE_INTERVAL_MS,
}: {
  account?: Address;
  pageSize?: number;
  activityType?: string;
  /**
   * Scope the feed to a single pick configuration. Filters predictions by
   * pickConfigId and trades by the pickConfig's predictor/counterparty tokens.
   */
  pickConfigId?: string;
  /**
   * Scope the feed to a single position token. With `account`, predictions
   * only match the side that minted that token; trades match exact token.
   */
  token?: Address;
  /**
   * Scope the feed to a condition. Matches every pick configuration whose
   * picks reference this conditionId.
   */
  conditionId?: string;
  /**
   * Override enabled state. Defaults to true — the unscoped feed returns
   * recent global activity. Pass false to skip the query entirely.
   */
  enabled?: boolean;
  /**
   * Poll the newest page on an interval and surface items that arrive after
   * the initial load as `pendingCount` / `pendingItems` (held back until
   * `revealPending()`), rather than silently mutating the visible list.
   * Defaults to false — polling a full page per mounted table is real API
   * load, so consumers opt in (the global feed does).
   */
  enableLive?: boolean;
  /** Polling cadence for the live "new activity" check. */
  liveIntervalMs?: number;
}) {
  const enabled = enabledOverride ?? true;

  const typeFilter =
    activityType && activityType !== 'all' ? activityType : undefined;
  // ActivityFilter.types: null means "all"; [] would be a zero-result
  // query, so the unfiltered case must send null.
  const types =
    typeFilter === 'prediction'
      ? ['PREDICTION']
      : typeFilter === 'trade'
        ? ['TRADE']
        : null;

  const {
    data,
    isLoading: initialLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'accountActivity',
      account ?? 'global',
      typeFilter,
      pickConfigId ?? null,
      token ?? null,
      conditionId ?? null,
      pageSize,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Forward-only cursor pagination: thread the previous page's endCursor
    // in as `after` (the previous skip/take approach used a length-based stop signal).
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityConnection) =>
      lastPage.pageInfo.hasNextPage
        ? (lastPage.pageInfo.endCursor ?? undefined)
        : undefined,
    queryFn: async ({ pageParam }) => {
      const resp = await graphqlRequest<{
        activity: ActivityConnection | null;
      }>(ACCOUNT_ACTIVITY_QUERY, {
        account: account ?? null,
        conditionIds: conditionId ? [conditionId] : null,
        pickConfigId: pickConfigId ?? null,
        token: token ?? null,
        types,
        first: pageSize,
        after: pageParam ?? null,
      });
      return resp?.activity ?? EMPTY_ACTIVITY_PAGE;
    },
  });

  // Only show loading spinner on true initial load (no data yet)
  const isLoading = initialLoading && !data;
  const isFetchingMore = isFetchingNextPage;

  // Map edges to typed ActivityItems, deduping on the domain id
  // (predictionId / tradeHash) — cursor boundaries can overlap on refetch.
  const baseItems: ActivityItem[] = useMemo(() => {
    const seen = new Set<string>();
    const mapped: ActivityItem[] = [];
    for (const page of data?.pages ?? []) {
      for (const item of mapEdges(page.edges, account)) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        mapped.push(item);
      }
    }
    return mapped;
  }, [data, account]);

  // ── Live "new activity" polling ────────────────────────────────────────────
  // A lightweight, separate query for just the newest page. It refetches on an
  // interval and, on a fresh queryKey, is cheap-isolated from the paginated
  // query above so revealing/holding new items never disturbs the visible list
  // or the user's scroll position.
  const queryClient = useQueryClient();
  const liveQueryKey = useMemo(
    () => [
      'accountActivityLive',
      account ?? 'global',
      typeFilter,
      pickConfigId ?? null,
      token ?? null,
      conditionId ?? null,
      pageSize,
    ],
    [account, typeFilter, pickConfigId, token, conditionId, pageSize]
  );

  // Items the user has explicitly pulled in from the pending banner. Prepended
  // (newest first) ahead of the paginated list. Snapshots only anchor position;
  // the `items` memo below resolves each key to its freshest copy.
  const [revealed, setRevealed] = useState<ActivityItem[]>([]);

  // The live poll waits for the base query's first page and starts from a
  // cache seeded with it. That (a) avoids a second, byte-identical page-1
  // request at mount, and (b) keeps the pending banner off when the base
  // query failed — otherwise every live item would count as "new" against an
  // empty screen and revealing would strand the user with no pagination.
  const [liveSeeded, setLiveSeeded] = useState(false);
  const firstPage = data?.pages[0];

  // Reset the reveal/seed state whenever the query scope changes — a new
  // filter means a different feed, so previously-revealed items no longer
  // belong and the live cache must re-seed from the new scope's first page.
  const scopeKey = `${account ?? 'global'}|${typeFilter ?? ''}|${
    pickConfigId ?? ''
  }|${token ?? ''}|${conditionId ?? ''}|${pageSize}`;
  useEffect(() => {
    setRevealed([]);
    setLiveSeeded(false);
  }, [scopeKey]);

  useEffect(() => {
    if (!enableLive || liveSeeded || !firstPage) return;
    queryClient.setQueryData<ActivityConnection>(
      liveQueryKey,
      (existing) => existing ?? firstPage
    );
    setLiveSeeded(true);
  }, [enableLive, liveSeeded, firstPage, queryClient, liveQueryKey]);

  const liveQuery = useQuery({
    queryKey: liveQueryKey,
    enabled: enabled && enableLive && liveSeeded,
    // Seeded/polled data counts as fresh for one interval so enabling the
    // query (or remounting within it) doesn't refetch what we just wrote.
    staleTime: liveIntervalMs,
    gcTime: 5 * 60 * 1000,
    refetchInterval: liveIntervalMs,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        activity: ActivityConnection | null;
      }>(ACCOUNT_ACTIVITY_QUERY, {
        account: account ?? null,
        conditionIds: conditionId ? [conditionId] : null,
        pickConfigId: pickConfigId ?? null,
        token: token ?? null,
        types,
        first: pageSize,
        after: null,
      });
      return resp?.activity ?? EMPTY_ACTIVITY_PAGE;
    },
  });

  const liveItems = useMemo(
    () => mapEdges(liveQuery.data?.edges, account),
    [liveQuery.data, account]
  );

  // Everything currently on screen (revealed + paginated), deduped.
  const visibleKeys = useMemo(() => {
    const s = new Set<string>();
    for (const it of revealed) s.add(itemKey(it));
    for (const it of baseItems) s.add(itemKey(it));
    return s;
  }, [revealed, baseItems]);

  // New items the live poll found that aren't on screen yet.
  const pending = useMemo(
    () => liveItems.filter((it) => !visibleKeys.has(itemKey(it))),
    [liveItems, visibleKeys]
  );

  const items: ActivityItem[] = useMemo(() => {
    // Revealed entries fix the ordering (newest-first ahead of the paginated
    // list), but each key renders its freshest copy: the live poll re-reads
    // page 1 every interval and the base query refetches, so preferring their
    // copies keeps a revealed row from freezing at its reveal-time snapshot
    // (e.g. never showing `settled`).
    const freshByKey = new Map<string, ActivityItem>();
    for (const it of liveItems) freshByKey.set(itemKey(it), it);
    for (const it of baseItems) {
      const key = itemKey(it);
      if (!freshByKey.has(key)) freshByKey.set(key, it);
    }
    const seen = new Set<string>();
    const out: ActivityItem[] = [];
    for (const it of [...revealed, ...baseItems]) {
      const key = itemKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(freshByKey.get(key) ?? it);
    }
    return out;
  }, [revealed, baseItems, liveItems]);

  const revealPending = useCallback(() => {
    setRevealed((prev) => {
      const seen = new Set(prev.map(itemKey));
      const fresh = pending.filter((it) => !seen.has(itemKey(it)));
      if (fresh.length === 0) return prev;
      // `pending` is already newest-first from the server; keep it that way.
      return [...fresh, ...prev];
    });
  }, [pending]);

  const hasMore = Boolean(hasNextPage);
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    items,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
    pendingCount: pending.length,
    /** Held-back new items, newest first — exposed so consumers that filter
     *  client-side can count only the items the user will actually see. */
    pendingItems: pending,
    revealPending,
  };
}
