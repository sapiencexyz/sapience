'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile, useIsBelow } from '@sapience/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import { parseUnits, erc20Abi } from 'viem';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionRequestRow from '~/components/terminal/AuctionRequestRow';
import AutoBid from '~/components/terminal/AutoBid';
import { ApprovalDialogProvider } from '~/components/terminal/ApprovalDialogContext';
import ApprovalDialog from '~/components/terminal/ApprovalDialog';
import { TerminalLogsProvider } from '~/components/terminal/TerminalLogsContext';
import { useCategories } from '~/hooks/graphql/useCategories';
import StackedPredictions, {
  type Pick,
} from '~/components/shared/StackedPredictions';
import { PythPredictionListItem, type PythPrediction } from '@sapience/ui';
import {
  decodeAuctionPredictedOutcomes,
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '~/lib/auction/decodePredictedOutcomes';
import { usePythFeedLabel } from '~/lib/pyth/usePythFeedLabel';

import CategoryFilter from '~/components/terminal/filters/CategoryFilter';
import ConditionsFilter from '~/components/terminal/filters/ConditionsFilter';
import MinBidsFilter from '~/components/terminal/filters/MinBidsFilter';
import MinWagerFilter from '~/components/terminal/filters/MinWagerFilter';
import { type MultiSelectItem } from '~/components/terminal/filters/MultiSelect';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { useReadContracts } from 'wagmi';
import { predictionMarket } from '@sapience/sdk/contracts';
import { predictionMarketAbi } from '@sapience/sdk';
import bidsHub from '~/lib/auction/useAuctionBidsHub';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

const TerminalPageContent: React.FC = () => {
  const { messages } = useAuctionRelayerFeed({ observeVaultQuotes: false });
  const chainId = useChainIdFromLocalStorage();
  const collateralAssetTicker = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);
  const desktopBottomGap = 'clamp(16px, 2.5vw, 32px)';
  const desktopViewportHeight = `calc(100dvh - var(--page-top-offset, 0px) - ${desktopBottomGap})`;

  const [pinnedAuctions, setPinnedAuctions] = useState<string[]>([]);
  const [expandedAuctions, setExpandedAuctions] = useState<Set<string>>(
    new Set()
  );
  const [minWager, setMinWager] = useState<string>('1');
  const [minBids, setMinBids] = useState<string>('0');
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>(
    []
  );
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(
    []
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

  const getAuctionId = useCallback((m: any): string | null => {
    return (
      (m?.channel as string) ||
      (m?.data?.auctionId as string) ||
      (m?.data?.payload?.auctionId as string) ||
      (m?.auctionId as string) ||
      null
    );
  }, []);

  // Cached decoder for predicted outcomes keyed by auctionId + makerNonce
  // Stores { data, accessedAt } for time-based LRU pruning
  const decodeCacheRef = useRef<
    Map<
      string,
      {
        data:
          | {
              kind: 'uma';
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
      data: any;
    }):
      | {
          kind: 'uma';
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
        const cacheKey = `${getAuctionId(m) || 'unknown'}:${String(
          m?.data?.makerNonce ?? 'n'
        )}`;
        const cached = decodeCacheRef.current.get(cacheKey);
        if (cached) {
          // Update access time on cache hit
          cached.accessedAt = Date.now();
          return cached.data;
        }
        const decoded = decodeAuctionPredictedOutcomes({
          resolver:
            (m as any)?.data?.resolver ?? (m as any)?.data?.payload?.resolver,
          predictedOutcomes: (m as any)?.data?.predictedOutcomes,
        });
        const entry =
          decoded.kind === 'uma'
            ? {
                kind: 'uma' as const,
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
    const latestStarted = new Map<string, any>();
    for (const m of auctionAndBidMessages) {
      const id = getAuctionId(m as any);
      if (!id) continue;
      const t = Number((m as any)?.time || 0);
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
        const decoded = decodeAuctionPredictedOutcomes({
          resolver:
            (m as any)?.data?.resolver ?? (m as any)?.data?.payload?.resolver,
          predictedOutcomes: (m as any)?.data?.predictedOutcomes,
        });
        if (decoded.kind !== 'uma') continue;
        for (const o of decoded.outcomes || []) {
          const id = (o as any)?.marketId as string | undefined;
          if (id && typeof id === 'string') set.add(id);
        }
      }
    } catch {
      /* noop */
    }
    return Array.from(set);
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
  const stickyConditionMapRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    try {
      for (const c of conditions || []) {
        if (c && typeof c.id === 'string') {
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
    } catch {
      /* noop */
    }
  }, [conditions]);
  const renderConditionMap = stickyConditionMapRef.current;

  // Render rows only after the first conditions request completes (success or error); do not hide again on refetches
  const [hasLoadedConditionsOnce, setHasLoadedConditionsOnce] = useState(false);
  useEffect(() => {
    if (!areConditionsLoading || !!conditionsError)
      setHasLoadedConditionsOnce(true);
  }, [areConditionsLoading, conditionsError]);

  // Categories for multi-select
  const { data: categories = [] } = useCategories();

  function renderPredictionsCell(m: { type: string; data: any }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;
      const decoded = getDecodedPredictedOutcomes(m as any);

      // If we can't decode any legs, show bytecode payload only if request errored or completed
      if (!decoded || decoded.kind === 'unknown' || decoded.data.length === 0) {
        const encodedArr: string[] = Array.isArray(
          (m as any)?.data?.predictedOutcomes
        )
          ? ((m as any).data.predictedOutcomes as string[])
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
        const encodedArr: string[] = Array.isArray(
          (m as any)?.data?.predictedOutcomes
        )
          ? ((m as any).data.predictedOutcomes as string[])
          : [];
        const encoded = encodedArr[0];
        if (conditionsError && encoded) {
          return (
            <span className="text-xs font-mono text-brand-white/80 break-all">
              {String(encoded)}
            </span>
          );
        }
        return null;
      }

      const legs = decoded.data.map((o) => {
        const cond = renderConditionMap.get(o.marketId);
        return {
          id: o.marketId,
          title: cond?.shortName ?? cond?.question ?? String(o.marketId),
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
          <StackedPredictions legs={picks} className="max-w-full" />
        </motion.div>
      );
    } catch {
      return null;
    }
  }

  // Fetch PredictionMarket config to get collateral token, then read ERC20 decimals
  const PREDICTION_MARKET_ADDRESS = predictionMarket[chainId]?.address;
  const predictionMarketConfigRead = useReadContracts({
    contracts: PREDICTION_MARKET_ADDRESS
      ? [
          {
            address: PREDICTION_MARKET_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!PREDICTION_MARKET_ADDRESS },
  });

  const collateralTokenAddress: `0x${string}` | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { collateralToken: `0x${string}` };
      return cfg?.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

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

  const minWagerWei = useMemo(() => {
    try {
      return parseUnits(minWager || '0', tokenDecimals);
    } catch {
      return 0n;
    }
  }, [minWager, tokenDecimals]);

  const minBidsNum = useMemo(() => {
    const n = parseInt(minBids || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [minBids]);

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

    // Prune inactive unpinned (> 30m); pinned always visible
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const pruned = baseRows.filter(
      (row) => row.pinned || row.lastActivity >= thirtyMinAgo
    );

    // Helper: apply content filters only to UNPINNED rows
    const passFilters = (row: (typeof pruned)[number]) => {
      // Pinned rows bypass filters entirely
      if (row.pinned) return true;

      const decoded = getDecodedPredictedOutcomes(row.m);
      const legConditionIds =
        decoded.kind === 'uma'
          ? decoded.data.map((l) => String(l.marketId))
          : [];
      const legCategorySlugs =
        decoded.kind === 'uma'
          ? decoded.data.map((l) => {
              const cond = renderConditionMap.get(String(l.marketId));
              return cond?.category?.slug ?? null;
            })
          : decoded.kind === 'pyth'
            ? (['prices'] as const)
            : [];

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

      try {
        const makerWagerWei = BigInt(String(row.m?.data?.wager ?? '0'));
        const bidsCount = bidsCountByAuction.get(row.id) ?? 0;
        if (bidsCount < minBidsNum) return false;
        return makerWagerWei >= minWagerWei;
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
    minWagerWei,
    minBidsNum,
    bidsCountByAuction,
    selectedCategorySlugs,
    selectedConditionIds,
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
    minWagerWei,
    minBidsNum,
    selectedCategorySlugs,
    selectedConditionIds,
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
      rowObserversRef.current.clear();
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

  function toUiTx(m: { time: number; type: string; data: any }): UiTransaction {
    const createdAt = new Date(m.time).toISOString();
    if (m.type === 'auction.started') {
      const maker = (m as any)?.data?.maker || '';
      const wager = (m as any)?.data?.wager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(wager || '0'),
        position: { owner: maker },
      } as UiTransaction;
    }
    if (m.type === 'auction.bids') {
      const bids = Array.isArray((m as any)?.data?.bids)
        ? ((m as any).data.bids as unknown as any[])
        : [];
      const top = bids.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.makerWager ?? '0'));
          const bestVal = BigInt(String(best?.makerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const taker = top?.taker || '';
      const makerWager = top?.makerWager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(makerWager || '0'),
        position: { owner: taker },
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
        <div className="h-full min-h-0">
          <div className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start">
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
                      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 flex-1">
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

                        {/* Minimum Bids */}
                        <div className="flex flex-col md:col-span-1">
                          <MinBidsFilter
                            value={minBids}
                            onChange={setMinBids}
                          />
                        </div>

                        {/* Minimum Wager */}
                        <div className="flex flex-col md:col-span-1">
                          <MinWagerFilter
                            value={minWager}
                            onChange={setMinWager}
                          />
                        </div>

                        {/* Addresses filter removed */}
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
                            const rowKey = `auction-pinned-${auctionId ?? idx}`;
                            return (
                              <div key={rowKey}>
                                <AuctionRequestRow
                                  uiTx={toUiTx(m)}
                                  predictionsContent={renderPredictionsCell(m)}
                                  auctionId={auctionId}
                                  takerWager={String(m?.data?.wager ?? '0')}
                                  taker={m?.data?.taker || null}
                                  resolver={m?.data?.resolver || null}
                                  predictedOutcomes={
                                    Array.isArray(m?.data?.predictedOutcomes)
                                      ? (m?.data?.predictedOutcomes as string[])
                                      : []
                                  }
                                  takerNonce={(() => {
                                    const raw = m?.data?.takerNonce;
                                    const n = Number(raw);
                                    return Number.isFinite(n) ? n : null;
                                  })()}
                                  collateralAssetTicker={collateralAssetTicker}
                                  onTogglePin={togglePin}
                                  isPinned={true}
                                  isExpanded={expandedAuctions.has(auctionId)}
                                  onToggleExpanded={toggleExpanded}
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
                                      takerWager={String(m?.data?.wager ?? '0')}
                                      taker={m?.data?.taker || null}
                                      resolver={m?.data?.resolver || null}
                                      predictedOutcomes={
                                        Array.isArray(
                                          m?.data?.predictedOutcomes
                                        )
                                          ? (m?.data
                                              ?.predictedOutcomes as string[])
                                          : []
                                      }
                                      takerNonce={(() => {
                                        const raw = m?.data?.takerNonce;
                                        const n = Number(raw);
                                        return Number.isFinite(n) ? n : null;
                                      })()}
                                      collateralAssetTicker={
                                        collateralAssetTicker
                                      }
                                      onTogglePin={togglePin}
                                      isPinned={false}
                                      isExpanded={expandedAuctions.has(
                                        auctionId
                                      )}
                                      onToggleExpanded={toggleExpanded}
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

function pythSideFromMakerPrediction(params: {
  makerPrediction: boolean; // true=Over, false=Under
  perspective: 'maker' | 'taker';
}): { direction: 'over' | 'under'; choice: 'OVER' | 'UNDER' } {
  // For Pyth, the counterparty/taker is always the opposite side of the maker.
  const displayPrediction =
    params.perspective === 'taker'
      ? !params.makerPrediction
      : params.makerPrediction;
  return displayPrediction
    ? { direction: 'over', choice: 'OVER' }
    : { direction: 'under', choice: 'UNDER' };
}

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
  // In the auction/taker view we show what the TAKER needs to win.
  // maker Over -> taker Under, maker Under -> taker Over.
  const side = pythSideFromMakerPrediction({
    makerPrediction: first.prediction,
    perspective: 'taker',
  });
  const priceStr = formatPythPriceDecimalFromInt(
    first.strikePrice,
    first.strikeExpo
  );
  const priceNum = Number(priceStr);

  const pythPrediction: PythPrediction = {
    id: `${first.priceId}:${first.endTime.toString()}:${first.strikePrice.toString()}:${first.strikeExpo}`,
    priceId: first.priceId,
    priceFeedLabel: feedLabel ?? undefined,
    direction: side.direction,
    targetPrice: Number.isFinite(priceNum) ? priceNum : 0,
    targetPriceRaw: priceStr,
    targetPriceFullPrecision: priceStr,
    priceExpo: first.strikeExpo,
    dateTimeLocal: formatUnixSecondsToLocalInput(first.endTime),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      <div className="max-w-full">
        <PythPredictionListItem prediction={pythPrediction} layout="inline" />
      </div>
    </motion.div>
  );
}
