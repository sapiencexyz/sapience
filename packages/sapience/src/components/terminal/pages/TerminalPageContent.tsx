'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { decodeAbiParameters, parseUnits, erc20Abi } from 'viem';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionRequestRow from '~/components/terminal/AuctionRequestRow';
import AutoBid from '~/components/terminal/AutoBid';
import { ApprovalDialogProvider } from '~/components/terminal/ApprovalDialogContext';
import ApprovalDialog from '~/components/terminal/ApprovalDialog';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useCategories } from '~/hooks/graphql/useMarketGroups';

import MarketBadge from '~/components/markets/MarketBadge';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
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

const TerminalPageContent: React.FC = () => {
  const { messages } = useAuctionRelayerFeed({ observeVaultQuotes: false });
  const chainId = useChainIdFromLocalStorage();

  const [pinnedAuctions, setPinnedAuctions] = useState<string[]>([]);
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
  const decodeCacheRef = useRef<
    Map<string, Array<{ marketId: `0x${string}`; prediction: boolean }>>
  >(new Map());
  const getDecodedPredictedOutcomes = useCallback(
    (m: {
      type: string;
      data: any;
    }): Array<{ marketId: `0x${string}`; prediction: boolean }> => {
      try {
        if (m?.type !== 'auction.started') return [];
        const cacheKey = `${getAuctionId(m) || 'unknown'}:${String(
          m?.data?.makerNonce ?? 'n'
        )}`;
        const cached = decodeCacheRef.current.get(cacheKey);
        if (cached) return cached;
        const arr = Array.isArray(m?.data?.predictedOutcomes)
          ? (m.data.predictedOutcomes as string[])
          : [];
        const encoded = arr[0] as `0x${string}` | undefined;
        if (!encoded) return [];
        const decodedUnknown = decodeAbiParameters(
          [
            {
              type: 'tuple[]',
              components: [
                { name: 'marketId', type: 'bytes32' },
                { name: 'prediction', type: 'bool' },
              ],
            },
          ] as const,
          encoded
        ) as unknown;
        const decodedArr = Array.isArray(decodedUnknown)
          ? ((decodedUnknown as any)[0] as Array<{
              marketId: `0x${string}`;
              prediction: boolean;
            }>)
          : [];
        const legs = (decodedArr || []).map((o) => ({
          marketId: o.marketId,
          prediction: !!o.prediction,
        }));
        decodeCacheRef.current.set(cacheKey, legs);
        return legs;
      } catch {
        return [];
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

  // Collect unique conditionIds from auction.started messages for enrichment
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    try {
      for (const m of auctionAndBidMessages) {
        if (m.type !== 'auction.started') continue;
        const arr = Array.isArray((m as any)?.data?.predictedOutcomes)
          ? ((m as any).data.predictedOutcomes as unknown as string[])
          : [];
        if (arr.length === 0) continue;
        try {
          const decodedUnknown = decodeAbiParameters(
            [
              {
                type: 'tuple[]',
                components: [
                  { name: 'marketId', type: 'bytes32' },
                  { name: 'prediction', type: 'bool' },
                ],
              },
            ] as const,
            arr[0] as `0x${string}`
          ) as unknown;
          const decodedArr = Array.isArray(decodedUnknown)
            ? ((decodedUnknown as any)[0] as Array<{ marketId: string }>)
            : [];
          for (const o of decodedArr || []) {
            const id = (o as any)?.marketId as string | undefined;
            if (id && typeof id === 'string') set.add(id);
          }
        } catch {
          /* noop */
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
  const stickyConditionMapRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    try {
      for (const c of conditions || []) {
        if (c && typeof c.id === 'string')
          stickyConditionMapRef.current.set(c.id, c);
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

  // Horizontal predictions scroller with right gradient (mirrors UserParlaysTable)
  const PredictionsScroller: React.FC<{
    legs: Array<{
      id: `0x${string}`;
      title: string;
      categorySlug: string | null;
      choice: 'Yes' | 'No';
    }>;
  }> = ({ legs }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [showRightGradient, setShowRightGradient] = useState(false);

    const updateGradientVisibility = useCallback(() => {
      const el = containerRef.current;
      if (!el) {
        setShowRightGradient(false);
        return;
      }
      const canScroll = el.scrollWidth > el.clientWidth + 1;
      if (!canScroll) {
        setShowRightGradient(false);
        return;
      }
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      setShowRightGradient(!atEnd);
    }, []);

    useEffect(() => {
      updateGradientVisibility();
      const el = containerRef.current;
      if (!el) return;
      const onScroll = () => updateGradientVisibility();
      el.addEventListener('scroll', onScroll, { passive: true });
      const onResize = () => updateGradientVisibility();
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(() => updateGradientVisibility());
      ro.observe(el);
      return () => {
        el.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        ro.disconnect();
      };
    }, [updateGradientVisibility]);

    return (
      <div className="relative w-full max-w-full">
        <div
          ref={containerRef}
          className="overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-3 md:gap-4 pr-16 flex-nowrap">
            {legs.map((leg, i) => (
              <div
                key={i}
                className="inline-flex h-7 items-center gap-3 shrink-0"
              >
                <MarketBadge
                  label={String(leg.title)}
                  size={28}
                  categorySlug={leg.categorySlug || undefined}
                  color={
                    leg.categorySlug
                      ? getCategoryStyle(leg.categorySlug)?.color
                      : undefined
                  }
                />
                <ConditionTitleLink
                  conditionId={leg.id}
                  title={String(leg.title)}
                  className="text-sm"
                  clampLines={1}
                />
                <span
                  className={
                    leg.choice === 'Yes'
                      ? 'px-2 py-1 text-xs font-medium font-mono border border-green-500/40 bg-green-500/10 text-green-600 rounded'
                      : 'px-2 py-1 text-xs font-medium font-mono border border-red-500/40 bg-red-500/10 text-red-600 rounded'
                  }
                >
                  {leg.choice}
                </span>
              </div>
            ))}
          </div>
        </div>
        {showRightGradient && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-brand-black to-transparent"
          />
        )}
      </div>
    );
  };

  function renderPredictionsCell(m: { type: string; data: any }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;
      const decoded = getDecodedPredictedOutcomes(m as any);

      // If we can't decode any legs, show bytecode payload only if request errored or completed
      if (!decoded || decoded.length === 0) {
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

      // Gate until all condition names are available to avoid flashing raw IDs
      const allResolved = decoded.every((o) =>
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

      const legs = decoded.map((o) => {
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
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          <PredictionsScroller legs={legs} />
        </motion.div>
      );
    } catch {
      return null;
    }
  }

  const collateralAssetTicker = 'testUSDe';
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

      const legs = getDecodedPredictedOutcomes(row.m);
      const legConditionIds = legs.map((l) => String(l.marketId));
      const legCategorySlugs = legs.map((l) => {
        const cond = renderConditionMap.get(String(l.marketId));
        return cond?.category?.slug ?? null;
      });

      const matchesCategory =
        selectedCategorySlugs.length === 0 ||
        legCategorySlugs.some(
          (slug) => slug != null && selectedCategorySlugs.includes(slug)
        );
      if (!matchesCategory) return false;

      const matchesCondition =
        selectedConditionIds.length === 0 ||
        legConditionIds.some((id) => !!id && selectedConditionIds.includes(id));
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
          const cur = BigInt(String(b?.takerWager ?? '0'));
          const bestVal = BigInt(String(best?.takerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const taker = top?.taker || '';
      const takerWager = top?.takerWager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(takerWager || '0'),
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
    <ApprovalDialogProvider>
      <div className="px-4 md:px-6 pt-4 md:pt-0 pb-4 md:pb-6 h-full min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-0">
          <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black lg:col-span-3 flex flex-col h-full min-h-0 md:max-h-[85vh]">
            <div className="flex-none">
              <div className="pl-4 pr-3 py-3 border-b border-border/60 bg-muted/10">
                <div className="flex items-center gap-4">
                  <div className="eyebrow text-foreground hidden md:block">
                    Filters
                  </div>
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-4 flex-1">
                    {/* Categories */}
                    <div className="flex flex-col md:col-span-1">
                      <CategoryFilter
                        items={
                          (categories || []).map((c) => ({
                            value: c.slug,
                            label: c.name || c.slug,
                          })) as MultiSelectItem[]
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
                      <MinBidsFilter value={minBids} onChange={setMinBids} />
                    </div>

                    {/* Minimum Wager */}
                    <div className="flex flex-col md:col-span-1">
                      <MinWagerFilter value={minWager} onChange={setMinWager} />
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
                      to see an auction here.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <>
                    {hasLoadedConditionsOnce && (
                      <AnimatePresence initial={false} mode="sync">
                        {pinnedRows.map((row, idx) => {
                          const auctionId = row.id;
                          const m = row.m;
                          const rowKey = `auction-pinned-${auctionId ?? idx}`;
                          return (
                            <motion.div
                              key={rowKey}
                              layout
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.14, ease: 'easeOut' }}
                            >
                              <AuctionRequestRow
                                uiTx={toUiTx(m)}
                                predictionsContent={renderPredictionsCell(m)}
                                auctionId={auctionId}
                                makerWager={String(m?.data?.wager ?? '0')}
                                maker={m?.data?.maker || null}
                                resolver={m?.data?.resolver || null}
                                predictedOutcomes={
                                  Array.isArray(m?.data?.predictedOutcomes)
                                    ? (m?.data?.predictedOutcomes as string[])
                                    : []
                                }
                                makerNonce={(() => {
                                  const raw = m?.data?.makerNonce;
                                  const n = Number(raw);
                                  return Number.isFinite(n) ? n : null;
                                })()}
                                collateralAssetTicker={collateralAssetTicker}
                                onTogglePin={togglePin}
                                isPinned={true}
                              />
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}

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
                                  predictionsContent={renderPredictionsCell(m)}
                                  auctionId={auctionId}
                                  makerWager={String(m?.data?.wager ?? '0')}
                                  maker={m?.data?.maker || null}
                                  resolver={m?.data?.resolver || null}
                                  predictedOutcomes={
                                    Array.isArray(m?.data?.predictedOutcomes)
                                      ? (m?.data?.predictedOutcomes as string[])
                                      : []
                                  }
                                  makerNonce={(() => {
                                    const raw = m?.data?.makerNonce;
                                    const n = Number(raw);
                                    return Number.isFinite(n) ? n : null;
                                  })()}
                                  collateralAssetTicker={collateralAssetTicker}
                                  onTogglePin={togglePin}
                                  isPinned={false}
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
          <div className="flex flex-col gap-6 lg:col-span-1 h-full min-h-0">
            <AutoBid />
          </div>
        </div>
        <ApprovalDialog />
      </div>
    </ApprovalDialogProvider>
  );
};

export default TerminalPageContent;
