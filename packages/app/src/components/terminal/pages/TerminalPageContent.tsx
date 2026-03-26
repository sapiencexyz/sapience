'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile, useIsBelow } from '@sapience/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import { parseUnits, erc20Abi } from 'viem';
import { useVirtualizer } from '@tanstack/react-virtual';
import { decodePythMarketId } from '@sapience/sdk';
import { isPredictedYes } from '@sapience/sdk/types';
import type { ConditionById } from '@sapience/sdk/queries';
import { useReadContracts } from 'wagmi';
import { collateralToken } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useSessionState } from '~/hooks/useSessionState';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionRequestRow from '~/components/terminal/AuctionRequestRow';
import AutoBid from '~/components/terminal/AutoBid';
import { ApprovalDialogProvider } from '~/components/terminal/ApprovalDialogContext';
import ApprovalDialog from '~/components/terminal/ApprovalDialog';
import { TerminalLogsProvider } from '~/components/terminal/TerminalLogsContext';
import { useTradeSettledNotifications } from '~/hooks/useTradeSettledNotifications';
import { useCategories } from '~/hooks/graphql/useCategories';
import StackedPredictions, {
  type Pick,
} from '~/components/shared/StackedPredictions';
import {
  decodeAuctionPredictedOutcomes,
  formatPythPriceDecimalFromInt,
  PYTH_RESOLVER_SET,
} from '~/lib/auction/decodePredictedOutcomes';
import { usePythFeedLabel } from '~/lib/pyth/usePythFeedLabel';

import CategoryFilter from '~/components/terminal/filters/CategoryFilter';
import ConditionsFilter from '~/components/terminal/filters/ConditionsFilter';
import MinBidsFilter from '~/components/terminal/filters/MinBidsFilter';
import MinPositionSizeFilter from '~/components/terminal/filters/MinPositionSizeFilter';
import AddressFilter from '~/components/terminal/filters/AddressFilter';
import SignedFilter, {
  type SignedFilterValue,
} from '~/components/terminal/filters/SignedFilter';
import { type MultiSelectItem } from '~/components/terminal/filters/MultiSelect';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import Loader from '~/components/shared/Loader';
import bidsHub from '~/lib/auction/useAuctionBidsHub';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';

/** Shape of auction message data payload */
interface AuctionMessageData {
  auctionId?: string;
  predictor?: string;
  predictorCollateral?: string;
  predictorDeadline?: number;
  resolver?: string;
  predictedOutcomes?: string[];
  predictorNonce?: number | string;
  intentSignature?: string;
  picks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
  bids?: Array<Record<string, unknown>>;
  payload?: {
    auctionId?: string;
    resolver?: string;
    predictor?: string;
    predictorCollateral?: string;
    predictedOutcomes?: string[];
  };
  [key: string]: unknown;
}

/** Safely cast unknown feed message data to AuctionMessageData */
function asAuctionData(data: unknown): AuctionMessageData {
  if (data && typeof data === 'object') return data as AuctionMessageData;
  return {} as AuctionMessageData;
}

// Defined outside TerminalPageContent to prevent remounting on parent re-renders
const TradeNotifications = () => {
  useTradeSettledNotifications();
  return null;
};

const TerminalPageContent: React.FC = () => {
  const { messages } = useAuctionRelayerFeed({ observeVaultQuotes: false });
  const chainId = DEFAULT_CHAIN_ID;
  const collateralAssetTicker = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';

  // Ensure bids hub is connected regardless of whether any rows are rendered.
  // This fixes a chicken-and-egg bug where filtering by bid count (or other filters
  // that exclude all auctions) prevents bids from ever being received.
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  useEffect(() => {
    bidsHub.setUrl(wsUrl);
  }, [wsUrl]);

  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);
  const desktopFooterHeight = '36px';
  const desktopBottomGap = 'clamp(16px, 2.5vw, 32px)';
  const desktopViewportHeight = `calc(100dvh - var(--page-top-offset, 0px) - ${desktopFooterHeight} - ${desktopBottomGap})`;

  const [pinnedAuctions, setPinnedAuctions] = useState<string[]>([]);
  const [expandedAuctions, setExpandedAuctions] = useState<Set<string>>(
    new Set()
  );
  const [positionSizeRange, setPositionSizeRange] = useSessionState<
    [number, number]
  >('sapience.terminal.positionSizeRange', [0, Infinity]);
  const [bidsRange, setBidsRange] = useSessionState<[number, number]>(
    'sapience.terminal.bidsRange',
    [0, Infinity]
  );
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useSessionState<
    string[]
  >('sapience.terminal.selectedCategorySlugs', []);
  const [selectedConditionIds, setSelectedConditionIds] = useSessionState<
    string[]
  >('sapience.terminal.selectedConditionIds', []);
  const [selectedAddresses, setSelectedAddresses] = useSessionState<string[]>(
    'sapience.terminal.selectedAddresses',
    []
  );
  const [signedFilter, setSignedFilter] = useSessionState<SignedFilterValue>(
    'sapience.terminal.signedFilter',
    'all'
  );
  const togglePin = useCallback((auctionId: string | null) => {
    if (!auctionId) return;
    setPinnedAuctions((prev) => {
      const exists = prev.includes(auctionId);
      if (exists) return prev.filter((id) => id !== auctionId);
      return [...prev, auctionId];
    });
  }, []);

  const toggleExpanded = useCallback((auctionId: string | null) => {
    if (!auctionId) return;
    setExpandedAuctions((prev) => {
      const next = new Set(prev);
      if (next.has(auctionId)) {
        next.delete(auctionId);
      } else {
        next.add(auctionId);
      }
      return next;
    });
  }, []);

  const displayMessages = useMemo(() => {
    return [...messages].sort((a, b) => Number(b.time) - Number(a.time));
  }, [messages]);

  const auctionAndBidMessages = useMemo(() => {
    return displayMessages.filter(
      (m) => m.type === 'auction.started' || m.type === 'auction.bids'
    );
  }, [displayMessages]);

  const getAuctionId = useCallback(
    (m: {
      channel?: string | null;
      data?: unknown;
      auctionId?: string;
    }): string | null => {
      const d = asAuctionData(m?.data);
      return (
        m?.channel ||
        d?.auctionId ||
        d?.payload?.auctionId ||
        m?.auctionId ||
        null
      );
    },
    []
  );

  // Cached decoder for predicted outcomes keyed by auctionId + predictorNonce
  // Stores { data, accessedAt } for time-based LRU pruning
  const decodeCacheRef = useRef<
    Map<
      string,
      {
        data:
          | {
              kind: 'condition';
              data: Array<{ marketId: `0x${string}`; prediction: boolean }>;
            }
          | {
              kind: 'pyth';
              data: Array<{
                priceId: `0x${string}`;
                endTime: bigint;
                strikePrice: bigint;
                strikeExpo: number;
                overWinsOnTie: boolean;
                prediction: boolean;
              }>;
            }
          | { kind: 'unknown'; data: [] };
        accessedAt: number;
      }
    >
  >(new Map());
  const getDecodedPredictedOutcomes = useCallback(
    (m: {
      type: string;
      data: unknown;
    }):
      | {
          kind: 'condition';
          data: Array<{ marketId: `0x${string}`; prediction: boolean }>;
        }
      | {
          kind: 'pyth';
          data: Array<{
            priceId: `0x${string}`;
            endTime: bigint;
            strikePrice: bigint;
            strikeExpo: number;
            overWinsOnTie: boolean;
            prediction: boolean;
          }>;
        }
      | { kind: 'unknown'; data: [] } => {
      try {
        if (m?.type !== 'auction.started') return { kind: 'unknown', data: [] };
        const md = asAuctionData(m?.data);
        const cacheKey = `${getAuctionId(m as { channel?: string | null; data?: unknown }) || 'unknown'}:${String(
          md?.predictorNonce ?? 'n'
        )}`;
        const cached = decodeCacheRef.current.get(cacheKey);
        if (cached) {
          // Update access time on cache hit
          cached.accessedAt = Date.now();
          return cached.data;
        }
        const decoded = decodeAuctionPredictedOutcomes({
          resolver: md?.resolver ?? md?.payload?.resolver,
          predictedOutcomes: md?.predictedOutcomes,
        });
        const entry =
          decoded.kind === 'condition'
            ? {
                kind: 'condition' as const,
                data: decoded.outcomes.map((o) => ({
                  marketId: o.marketId,
                  prediction: !!o.prediction,
                })),
              }
            : decoded.kind === 'pyth'
              ? {
                  kind: 'pyth' as const,
                  data: decoded.outcomes.map((o) => ({
                    priceId: o.priceId,
                    endTime: o.endTime,
                    strikePrice: o.strikePrice,
                    strikeExpo: o.strikeExpo,
                    overWinsOnTie: o.overWinsOnTie,
                    prediction: !!o.prediction,
                  })),
                }
              : { kind: 'unknown' as const, data: [] as [] };
        decodeCacheRef.current.set(cacheKey, {
          data: entry,
          accessedAt: Date.now(),
        });
        return entry;
      } catch {
        return { kind: 'unknown', data: [] };
      }
    },
    [getAuctionId]
  );

  // Build maps for last activity and latest started message per auction
  const { lastActivityByAuction, latestStartedByAuction } = useMemo(() => {
    const lastActivity = new Map<string, number>();
    const latestStarted = new Map<
      string,
      (typeof auctionAndBidMessages)[number]
    >();
    for (const m of auctionAndBidMessages) {
      const id = getAuctionId(m);
      if (!id) continue;
      const t = Number(m?.time || 0);
      const prev = lastActivity.get(id) || 0;
      if (t > prev) lastActivity.set(id, t);
      if (m.type === 'auction.started') {
        const prevStarted = latestStarted.get(id);
        if (!prevStarted || Number(prevStarted?.time || 0) < t) {
          latestStarted.set(id, m);
        }
      }
    }
    return {
      lastActivityByAuction: lastActivity,
      latestStartedByAuction: latestStarted,
    };
  }, [auctionAndBidMessages, getAuctionId]);

  // Prune decode cache every 60s - remove entries not accessed in 2 hours
  useEffect(() => {
    const DECODE_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
    const timer = setInterval(() => {
      const cutoff = Date.now() - DECODE_CACHE_TTL_MS;
      for (const [cacheKey, entry] of Array.from(
        decodeCacheRef.current.entries()
      )) {
        if (entry.accessedAt < cutoff) {
          decodeCacheRef.current.delete(cacheKey);
        }
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Collect unique conditionIds from auction.started messages for enrichment
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    try {
      for (const m of auctionAndBidMessages) {
        if (m.type !== 'auction.started') continue;

        // Escrow auctions have picks[] with conditionId directly
        const mData = asAuctionData(m?.data);
        const picks = mData?.picks as
          | Array<{ conditionId?: string; conditionResolver?: string }>
          | undefined;
        if (Array.isArray(picks) && picks.length > 0) {
          for (const p of picks) {
            if (p.conditionId && typeof p.conditionId === 'string') {
              // Skip Pyth picks — they encode market params, not DB condition IDs
              const resolver = p.conditionResolver?.toLowerCase?.() ?? '';
              if (PYTH_RESOLVER_SET.has(resolver)) continue;
              set.add(p.conditionId);
            }
          }
          continue;
        }

        // V1 auctions use resolver + predictedOutcomes
        const decoded = decodeAuctionPredictedOutcomes({
          resolver: mData?.resolver ?? mData?.payload?.resolver,
          predictedOutcomes: mData?.predictedOutcomes,
        });
        if (decoded.kind !== 'condition') continue;
        for (const o of decoded.outcomes || []) {
          const id = o?.marketId as string | undefined;
          if (id && typeof id === 'string') set.add(id);
        }
      }
    } catch {
      /* noop */
    }
    return Array.from(set);
  }, [auctionAndBidMessages]);

  // Collect unique predictor addresses from auction.started messages for the address filter
  const uniqueAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const m of auctionAndBidMessages) {
      if (m.type !== 'auction.started') continue;
      const auctionData = m.data as AuctionMessageData | undefined;
      const addr = auctionData?.predictor;
      if (addr && typeof addr === 'string') {
        set.add(addr);
      }
    }
    return Array.from(set).sort();
  }, [auctionAndBidMessages]);

  // Query conditions to enrich shortName/question for decoded predicted outcomes
  const {
    list: conditions,
    isLoading: areConditionsLoading,
    error: conditionsError,
  } = useConditionsByIds(conditionIds);

  // Preserve previously resolved condition names to avoid flicker when query key changes
  // LRU-style capped at 2000 entries to prevent unbounded growth while being generous
  const CONDITION_CACHE_MAX = 2000;
  const stickyConditionMapRef = useRef<Map<string, ConditionById>>(new Map());
  const [conditionMapTick, setConditionMapTick] = useState(0);
  useEffect(() => {
    try {
      let changed = false;
      for (const c of conditions || []) {
        if (c && typeof c.id === 'string') {
          if (!stickyConditionMapRef.current.has(c.id)) changed = true;
          // Delete and re-add to update LRU order (Maps maintain insertion order)
          stickyConditionMapRef.current.delete(c.id);
          stickyConditionMapRef.current.set(c.id, c);
        }
      }
      // Prune oldest entries if over capacity
      while (stickyConditionMapRef.current.size > CONDITION_CACHE_MAX) {
        const oldestKey = stickyConditionMapRef.current.keys().next().value;
        if (oldestKey !== undefined) {
          stickyConditionMapRef.current.delete(oldestKey);
        } else {
          break;
        }
      }
      // Force re-render when new conditions are added to the map
      if (changed) setConditionMapTick((t) => (t + 1) % 1_000_000);
    } catch {
      /* noop */
    }
  }, [conditions]);
  void conditionMapTick;
  const renderConditionMap = stickyConditionMapRef.current;

  // Render rows only after the first conditions request completes (success or error); do not hide again on refetches
  const [hasLoadedConditionsOnce, setHasLoadedConditionsOnce] = useState(false);
  useEffect(() => {
    if (!areConditionsLoading || !!conditionsError)
      setHasLoadedConditionsOnce(true);
  }, [areConditionsLoading, conditionsError]);

  // Categories for multi-select
  const { data: categories = [] } = useCategories();

  function renderPredictionsCell(m: { type: string; data: unknown }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;

      // Escrow auctions: picks[] with conditionId directly
      const escrowPicks = asAuctionData(m.data)?.picks;
      if (Array.isArray(escrowPicks) && escrowPicks.length > 0) {
        // Check if first pick uses a Pyth resolver — render via PythPredictionsCell
        const firstResolver =
          escrowPicks[0]?.conditionResolver?.toLowerCase?.() ?? '';
        if (
          PYTH_RESOLVER_SET.has(firstResolver) &&
          escrowPicks[0]?.conditionId
        ) {
          try {
            const decoded = decodePythMarketId(
              escrowPicks[0].conditionId as `0x${string}`
            );
            if (!decoded) return null;
            return (
              <PythPredictionsCell
                first={{
                  ...decoded,
                  prediction: isPredictedYes(escrowPicks[0].predictedOutcome),
                }}
              />
            );
          } catch {
            return null;
          }
        }

        // Non-Pyth escrow: look up condition names from DB
        const allResolved = escrowPicks.every(
          (p) => p.conditionId && renderConditionMap.has(p.conditionId)
        );
        if (!allResolved) {
          if (conditionsError) return null;
          return <Loader className="w-4 h-4" />;
        }
        if (!hasLoadedConditionsOnce) return null;
        const picks: Pick[] = escrowPicks.map((p) => {
          const cond = renderConditionMap.get(p.conditionId);
          return {
            question: cond?.question ?? String(p.conditionId),
            // Terminal shows counterparty perspective (inverted from predictor)
            choice: isPredictedYes(p.predictedOutcome)
              ? ('No' as const)
              : ('Yes' as const),
            conditionId: String(p.conditionId),
            categorySlug: cond?.category?.slug ?? null,
          };
        });
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <StackedPredictions picks={picks} className="max-w-full" />
          </motion.div>
        );
      }

      // V1 auctions: decode from resolver + predictedOutcomes
      const decoded = getDecodedPredictedOutcomes(m);
      const cellData = asAuctionData(m.data);

      // If we can't decode any legs, show bytecode payload only if request errored or completed
      if (!decoded || decoded.kind === 'unknown' || decoded.data.length === 0) {
        const encodedArr: string[] = Array.isArray(cellData?.predictedOutcomes)
          ? cellData.predictedOutcomes
          : [];
        const encoded = encodedArr[0];
        if (encoded && (conditionsError || !areConditionsLoading)) {
          return (
            <span className="text-xs font-mono text-brand-white/80 break-all">
              {String(encoded)}
            </span>
          );
        }
        return null;
      }

      if (decoded.kind === 'pyth') {
        const first = decoded.data[0];
        if (!first) return null;
        return <PythPredictionsCell first={first} />;
      }

      // UMA: Gate until all condition names are available to avoid flashing raw IDs
      const allResolved = decoded.data.every((o) =>
        renderConditionMap.has(o.marketId)
      );
      if (!allResolved) {
        // If the query errored, fallback to bytecode to at least show something
        const encodedArr: string[] = Array.isArray(cellData?.predictedOutcomes)
          ? cellData.predictedOutcomes
          : [];
        const encoded = encodedArr[0];
        if (conditionsError && encoded) {
          return (
            <span className="text-xs font-mono text-brand-white/80 break-all">
              {String(encoded)}
            </span>
          );
        }
        return <Loader className="w-4 h-4" />;
      }

      const legs = decoded.data.map((o) => {
        const cond = renderConditionMap.get(o.marketId);
        return {
          id: o.marketId,
          title: cond?.question ?? String(o.marketId),
          categorySlug: cond?.category?.slug ?? null,
          // In the auction/taker view we show what the TAKER needs to win.
          // The taker wins if the maker is wrong on at least one leg, so we invert
          // the maker's predicted bool here for display only. Do not change encoding
          // semantics elsewhere: on-chain, prediction=true still means "Yes".
          choice: o.prediction ? ('No' as const) : ('Yes' as const),
        };
      });

      // Avoid flashing: wait until at least one conditions request completed
      if (!hasLoadedConditionsOnce) return null;
      const picks: Pick[] = legs.map(
        (leg): Pick => ({
          question: String(leg.title),
          choice: leg.choice,
          conditionId: String(leg.id),
          categorySlug: leg.categorySlug ?? null,
        })
      );
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          <StackedPredictions picks={picks} className="max-w-full" />
        </motion.div>
      );
    } catch {
      return null;
    }
  }

  // Use collateral token address directly from SDK constants
  const collateralTokenAddress: `0x${string}` | undefined = collateralToken[
    chainId
  ]?.address as `0x${string}` | undefined;

  const erc20MetaRead = useReadContracts({
    contracts: collateralTokenAddress
      ? [
          {
            address: collateralTokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!collateralTokenAddress },
  });

  const tokenDecimals = useMemo(() => {
    const item = erc20MetaRead.data?.[0];
    if (item && item.status === 'success') {
      try {
        return Number(item.result as unknown as number) || 18;
      } catch {
        return 18;
      }
    }
    return 18;
  }, [erc20MetaRead.data]);

  const positionSizeRangeWei = useMemo((): [bigint, bigint] => {
    try {
      const minWei = parseUnits(
        String(positionSizeRange[0] || 0),
        tokenDecimals
      );
      const maxWei =
        positionSizeRange[1] === Infinity
          ? BigInt(
              '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
            )
          : parseUnits(String(positionSizeRange[1]), tokenDecimals);
      return [minWei, maxWei];
    } catch {
      return [
        0n,
        BigInt(
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        ),
      ];
    }
  }, [positionSizeRange, tokenDecimals]);

  const bidsRangeNum = useMemo((): [number, number] => {
    const minBids =
      Number.isFinite(bidsRange[0]) && bidsRange[0] >= 0 ? bidsRange[0] : 0;
    const maxBids = Number.isFinite(bidsRange[1]) ? bidsRange[1] : Infinity;
    return [minBids, maxBids];
  }, [bidsRange]);

  // Track live bids via shared hub to keep counts in sync with row components
  const [bidsTick, setBidsTick] = useState(0);
  useEffect(() => {
    const off = bidsHub.addListener(() =>
      setBidsTick((t) => (t + 1) % 1_000_000)
    );
    return () => {
      off();
    };
  }, []);
  const bidsCountByAuction = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, arr] of bidsHub.bidsByAuctionId.entries()) {
      map.set(id, Array.isArray(arr) ? arr.length : 0);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bidsTick triggers recompute of external bidsHub state
  }, [bidsTick]);

  // Build pinned/unpinned rows for rendering
  const { pinnedRows, unpinnedRows } = useMemo(() => {
    const baseRows = Array.from(latestStartedByAuction.entries()).map(
      ([id, m]) => {
        const lastActivity =
          lastActivityByAuction.get(id) || Number(m?.time || 0);
        const pinned = pinnedAuctions.includes(id);
        return { id, m, lastActivity, pinned } as const;
      }
    );

    // Prune inactive unpinned (> 30m) and auctions past predictorDeadline; pinned always visible
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const nowSec = Math.floor(Date.now() / 1000);
    const pruned = baseRows.filter((row) => {
      if (row.pinned) return true;
      if (row.lastActivity < thirtyMinAgo) return false;
      // Hide auctions whose predictor deadline has passed (requester no longer listening)
      const auctionData = asAuctionData(row.m?.data);
      const deadline = auctionData?.predictorDeadline;
      if (typeof deadline === 'number' && deadline > 0 && deadline < nowSec)
        return false;
      return true;
    });

    // Helper: apply content filters only to UNPINNED rows
    const passFilters = (row: (typeof pruned)[number]) => {
      // Pinned rows bypass filters entirely
      if (row.pinned) return true;

      // Detect Pyth escrow auctions early — they don't have DB conditions
      const auctionDataForFilter = row.m?.data as
        | AuctionMessageData
        | undefined;
      const escrowPicksForFilter = auctionDataForFilter?.picks;
      const isPythEscrow =
        Array.isArray(escrowPicksForFilter) &&
        escrowPicksForFilter.length > 0 &&
        PYTH_RESOLVER_SET.has(
          escrowPicksForFilter[0]?.conditionResolver?.toLowerCase?.() ?? ''
        );

      let legConditionIds: string[] = [];
      let legCategorySlugs: (string | null)[] = [];

      if (isPythEscrow) {
        // Pyth escrow — category is always 'prices', no DB condition IDs
        legCategorySlugs = ['prices'];
      } else if (
        Array.isArray(escrowPicksForFilter) &&
        escrowPicksForFilter.length > 0
      ) {
        // Escrow auction: derive condition IDs and categories from picks
        legConditionIds = escrowPicksForFilter
          .filter(
            (p) =>
              !PYTH_RESOLVER_SET.has(p.conditionResolver?.toLowerCase?.() ?? '')
          )
          .map((p) => p.conditionId)
          .filter(Boolean);
        legCategorySlugs = legConditionIds.map((id) => {
          const cond = renderConditionMap.get(id);
          return cond?.category?.slug ?? null;
        });
      } else {
        // V1 fallback: decode from resolver + predictedOutcomes
        const decoded = getDecodedPredictedOutcomes(row.m);
        legConditionIds =
          decoded.kind === 'condition'
            ? decoded.data.map((l) => String(l.marketId))
            : [];
        legCategorySlugs = (() => {
          if (decoded.kind === 'condition') {
            return decoded.data.map((l) => {
              const cond = renderConditionMap.get(String(l.marketId));
              return cond?.category?.slug ?? null;
            });
          }
          if (decoded.kind === 'pyth') {
            return ['prices'] as const;
          }
          return [] as (string | null)[];
        })();
      }

      const matchesCategory =
        selectedCategorySlugs.length === 0 ||
        legCategorySlugs.some(
          (slug) => slug != null && selectedCategorySlugs.includes(slug)
        );
      if (!matchesCategory) return false;

      const matchesCondition =
        selectedConditionIds.length === 0 ||
        selectedConditionIds.every((selectedId) =>
          legConditionIds.includes(selectedId)
        );
      if (!matchesCondition) return false;

      // Check address filter
      const auctionData = row.m?.data as AuctionMessageData | undefined;
      if (selectedAddresses.length > 0) {
        if (
          !auctionData?.predictor ||
          !selectedAddresses.includes(auctionData.predictor)
        )
          return false;
      }

      // Check signed filter — signed means predictor provided an EIP-712 intentSignature
      const isSigned = !!auctionData?.intentSignature;
      if (signedFilter === 'signed' && !isSigned) return false;
      if (signedFilter === 'unsigned' && isSigned) return false;

      try {
        const positionSizeWei = BigInt(
          String(auctionData?.predictorCollateral ?? '0')
        );
        const bidsCount = bidsCountByAuction.get(row.id) ?? 0;
        // Check bids range
        if (bidsCount < bidsRangeNum[0]) return false;
        if (bidsRangeNum[1] !== Infinity && bidsCount > bidsRangeNum[1])
          return false;
        // Check position size range
        if (positionSizeWei < positionSizeRangeWei[0]) return false;
        if (positionSizeWei > positionSizeRangeWei[1]) return false;
        return true;
      } catch {
        // On parse failure, do not include the row
        return false;
      }
    };

    const filtered = pruned.filter(passFilters);

    // Sort: pinned first, then by last activity desc
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.lastActivity - a.lastActivity;
    });

    const pinned = filtered.filter((r) => r.pinned);
    const unpinned = filtered.filter((r) => !r.pinned);
    return { pinnedRows: pinned, unpinnedRows: unpinned };
  }, [
    latestStartedByAuction,
    lastActivityByAuction,
    pinnedAuctions,
    positionSizeRangeWei,
    bidsRangeNum,
    bidsCountByAuction,
    selectedCategorySlugs,
    selectedConditionIds,
    selectedAddresses,
    signedFilter,
    renderConditionMap,
    getDecodedPredictedOutcomes,
  ]);

  // Keep the list area under Filters at its initial height and scroll when content grows
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Virtualizer must be created unconditionally to keep hook order stable
  const virtualizer = useVirtualizer({
    count: hasLoadedConditionsOnce ? unpinnedRows.length : 0,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => 84,
    overscan: 14,
    getItemKey: (index) => unpinnedRows[index]?.id ?? index,
  });

  // Reset scroll and re-measure when filters change to avoid stale items
  useEffect(() => {
    try {
      scrollAreaRef.current?.scrollTo({ top: 0 });
    } catch {
      /* noop */
    }
    try {
      virtualizer.scrollToIndex(0, { align: 'start' });
    } catch {
      /* noop */
    }
    try {
      virtualizer.measure();
    } catch {
      /* noop */
    }
  }, [
    positionSizeRangeWei,
    bidsRangeNum,
    selectedCategorySlugs,
    selectedConditionIds,
    selectedAddresses,
    signedFilter,
    virtualizer,
  ]);

  // Observe intrinsic row size changes and re-measure the virtualizer to prevent snap-backs
  const rowElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rowObserversRef = useRef<Map<number, ResizeObserver>>(new Map());
  const attachRowRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      const existing = rowObserversRef.current.get(index);
      if (existing) {
        existing.disconnect();
        rowObserversRef.current.delete(index);
      }
      if (!el) {
        rowElsRef.current.delete(index);
        return;
      }
      rowElsRef.current.set(index, el);
      try {
        virtualizer.measureElement(el);
      } catch {
        /* noop */
      }
      let rafId: number | null = null;
      const ro = new ResizeObserver(() => {
        try {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            try {
              virtualizer.measureElement(el);
            } catch {
              /* noop */
            }
            rafId = null;
          });
        } catch {
          /* noop */
        }
      });
      ro.observe(el);
      rowObserversRef.current.set(index, ro);
    },
    [virtualizer]
  );

  useEffect(() => {
    return () => {
      rowObserversRef.current.forEach((ro) => ro.disconnect());
      // eslint-disable-next-line react-hooks/exhaustive-deps
      rowObserversRef.current.clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      rowElsRef.current.clear();
    };
  }, []);

  // Prune stale row observers when row count shrinks
  useEffect(() => {
    const rowCount = unpinnedRows.length;
    for (const [idx, ro] of Array.from(rowObserversRef.current.entries())) {
      if (idx >= rowCount) {
        ro.disconnect();
        rowObserversRef.current.delete(idx);
        rowElsRef.current.delete(idx);
      }
    }
  }, [unpinnedRows.length]);

  // Re-measure virtual items when a row toggles/animates to ensure layout pushes down
  useEffect(() => {
    const remeasure = () => {
      try {
        virtualizer.measure();
      } catch {
        /* noop */
      }
    };
    window.addEventListener('terminal.row.expanded', remeasure);
    window.addEventListener('terminal.row.collapsed', remeasure);
    window.addEventListener('terminal.row.toggled', remeasure);
    window.addEventListener('terminal.row.layout', remeasure);
    return () => {
      window.removeEventListener('terminal.row.expanded', remeasure);
      window.removeEventListener('terminal.row.collapsed', remeasure);
      window.removeEventListener('terminal.row.toggled', remeasure);
      window.removeEventListener('terminal.row.layout', remeasure);
    };
  }, [virtualizer]);

  function toUiTx(m: {
    time: number;
    type: string;
    data: unknown;
  }): UiTransaction {
    const createdAt = new Date(m.time).toISOString();
    const txData = asAuctionData(m.data);
    if (m.type === 'auction.started') {
      const predictor = txData?.predictor || '';
      const predictorCollateral = txData?.predictorCollateral || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(predictorCollateral || '0'),
        position: { owner: predictor },
      } as UiTransaction;
    }
    if (m.type === 'auction.bids') {
      const bids = Array.isArray(txData?.bids) ? txData.bids : [];
      const top = bids.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.counterpartyCollateral ?? '0'));
          const bestVal = BigInt(String(best?.counterpartyCollateral ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const counterparty = top?.counterparty || '';
      const counterpartyCollateral = top?.counterpartyCollateral || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(counterpartyCollateral || '0'),
        position: { owner: counterparty },
      } as UiTransaction;
    }
    return {
      id: m.time,
      type: 'FORECAST',
      createdAt,
      collateral: '0',
      position: { owner: '' },
    } as UiTransaction;
  }

  return (
    <TerminalLogsProvider>
      <ApprovalDialogProvider>
        <TradeNotifications />
        <div className="h-full min-h-0 lg:overflow-hidden">
          <div className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start lg:overflow-hidden">
            {isCompact ? (
              <div className="block w-full lg:hidden mt-6 mb-8">
                <AutoBid />
              </div>
            ) : null}
            <div
              className="w-full lg:w-auto flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-6 pr-0 lg:pr-4 pb-6 lg:pb-0 h-full min-h-0"
              style={
                !isMobile
                  ? {
                      height: desktopViewportHeight,
                      maxHeight: desktopViewportHeight,
                    }
                  : undefined
              }
            >
              <div
                className="border border-border/60 rounded-lg overflow-hidden bg-brand-black flex flex-col h-full min-h-0"
                style={{
                  // Reserve viewport height while accounting for header/banner
                  minHeight: desktopViewportHeight,
                }}
              >
                <div className="flex-none">
                  <div className="p-3 border-b border-border/60 bg-muted/10">
                    <div className="flex items-center gap-4">
                      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 flex-1">
                        {/* Categories */}
                        <div className="flex flex-col md:col-span-1">
                          <CategoryFilter
                            items={
                              [
                                { value: 'prices', label: 'Prices' },
                                ...(categories || [])
                                  .filter((c) => c.slug !== 'prices')
                                  .map((c) => ({
                                    value: c.slug,
                                    label: c.name || c.slug,
                                  })),
                              ] as MultiSelectItem[]
                            }
                            selected={selectedCategorySlugs}
                            onChange={setSelectedCategorySlugs}
                          />
                        </div>

                        {/* Conditions with mode */}
                        <div className="flex flex-col md:col-span-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <ConditionsFilter
                                items={
                                  (conditions || []).map((c) => ({
                                    value: c.id,
                                    label:
                                      (c.shortName as string) ||
                                      (c.question as string) ||
                                      c.id,
                                  })) as MultiSelectItem[]
                                }
                                selected={selectedConditionIds}
                                onChange={setSelectedConditionIds}
                                categoryById={Object.fromEntries(
                                  (conditions || []).map((c) => [
                                    c.id,
                                    c?.category?.slug ?? null,
                                  ])
                                )}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Predictor Address */}
                        <div className="flex flex-col md:col-span-1">
                          <AddressFilter
                            items={uniqueAddresses.map((addr) => ({
                              value: addr,
                              label: addr,
                            }))}
                            selected={selectedAddresses}
                            onChange={setSelectedAddresses}
                          />
                        </div>

                        {/* Signed/Unsigned Filter */}
                        <div className="flex flex-col md:col-span-1">
                          <SignedFilter
                            value={signedFilter}
                            onChange={setSignedFilter}
                          />
                        </div>

                        {/* Bids Range */}
                        <div className="flex flex-col md:col-span-1">
                          <MinBidsFilter
                            value={bidsRange}
                            onChange={setBidsRange}
                          />
                        </div>

                        {/* Position Size Range */}
                        <div className="flex flex-col md:col-span-1">
                          <MinPositionSizeFilter
                            value={positionSizeRange}
                            onChange={setPositionSizeRange}
                            unit={collateralAssetTicker}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  ref={scrollAreaRef}
                  className="flex-1 min-h-0 overflow-y-auto flex flex-col"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {auctionAndBidMessages.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-24">
                      <div className="flex flex-col items-center">
                        <span className="inline-flex items-center gap-1 text-brand-white font-mono">
                          <span className="inline-block h-[6px] w-[6px] rounded-full bg-brand-white opacity-80 animate-ping mr-1.5" />
                          <span>Listening for messages...</span>
                        </span>
                        <p className="mt-2 text-xs text-brand-white/70">
                          <a
                            href="/markets"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-white underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80"
                          >
                            Make a prediction
                          </a>{' '}
                          in another window to see an auction here
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <>
                        {hasLoadedConditionsOnce &&
                          pinnedRows.map((row, idx) => {
                            const auctionId = row.id;
                            const m = row.m;
                            const d = asAuctionData(m?.data);
                            const rowKey = `auction-pinned-${auctionId ?? idx}`;
                            return (
                              <div key={rowKey}>
                                <AuctionRequestRow
                                  uiTx={toUiTx(m)}
                                  predictionsContent={renderPredictionsCell(m)}
                                  auctionId={auctionId}
                                  predictorCollateral={String(
                                    d?.predictorCollateral ?? '0'
                                  )}
                                  predictor={d?.predictor || null}
                                  collateralAssetTicker={collateralAssetTicker}
                                  onTogglePin={togglePin}
                                  isPinned={true}
                                  isExpanded={expandedAuctions.has(auctionId)}
                                  onToggleExpanded={toggleExpanded}
                                  picks={
                                    Array.isArray(d?.picks)
                                      ? d?.picks
                                      : undefined
                                  }
                                />
                              </div>
                            );
                          })}

                        {hasLoadedConditionsOnce && (
                          <div
                            style={{
                              height: virtualizer.getTotalSize(),
                              position: 'relative',
                            }}
                          >
                            {virtualizer.getVirtualItems().map((vi) => {
                              const row = unpinnedRows[vi.index];
                              const auctionId = row?.id;
                              const m = row?.m;
                              const d = asAuctionData(m?.data);
                              return (
                                <div
                                  key={vi.key}
                                  data-index={vi.index}
                                  ref={attachRowRef(vi.index)}
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${vi.start}px)`,
                                  }}
                                >
                                  {row && (
                                    <AuctionRequestRow
                                      uiTx={toUiTx(m)}
                                      predictionsContent={renderPredictionsCell(
                                        m
                                      )}
                                      auctionId={auctionId}
                                      predictorCollateral={String(
                                        d?.predictorCollateral ?? '0'
                                      )}
                                      predictor={d?.predictor || null}
                                      collateralAssetTicker={
                                        collateralAssetTicker
                                      }
                                      onTogglePin={togglePin}
                                      isPinned={false}
                                      isExpanded={expandedAuctions.has(
                                        auctionId
                                      )}
                                      onToggleExpanded={toggleExpanded}
                                      picks={
                                        Array.isArray(d?.picks)
                                          ? d?.picks
                                          : undefined
                                      }
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {!isMobile ? (
              <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-3 xl:ml-4 lg:mr-6">
                <div
                  className="rounded-none shadow-lg overflow-hidden"
                  style={{
                    height: desktopViewportHeight,
                    maxHeight: desktopViewportHeight,
                  }}
                >
                  <div className="h-full overflow-y-auto">
                    <AutoBid />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <ApprovalDialog />
        </div>
      </ApprovalDialogProvider>
    </TerminalLogsProvider>
  );
};

export default TerminalPageContent;

function PythPredictionsCell({
  first,
}: {
  first: {
    priceId: `0x${string}`;
    endTime: bigint;
    strikePrice: bigint;
    strikeExpo: number;
    overWinsOnTie: boolean;
    prediction: boolean;
  };
}) {
  const feedLabel = usePythFeedLabel(first.priceId);
  const priceStr = formatPythPriceDecimalFromInt(
    first.strikePrice,
    first.strikeExpo
  );

  // Taker perspective: invert the maker's prediction
  const takerChoice = first.prediction ? 'No' : 'Yes';
  const question = `${feedLabel ?? 'Crypto'} OVER $${priceStr}`;

  const picks: Pick[] = [
    {
      question,
      choice: takerChoice,
      source: 'pyth',
      categorySlug: 'prices',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      <StackedPredictions picks={picks} className="max-w-full" />
    </motion.div>
  );
}
