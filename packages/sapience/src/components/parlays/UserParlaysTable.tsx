'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
const ZERO_REF_CODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/sdk/ui/components/ui/table';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { useReadContracts, useAccount } from 'wagmi';
import type { Abi } from 'abitype';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { formatDistanceToNow } from 'date-fns';
// Minimal ABI for PredictionMarketUmaResolver.resolvePrediction(bytes)
const UMA_RESOLVER_MIN_ABI = [
  {
    type: 'function',
    name: 'resolvePrediction',
    stateMutability: 'view',
    inputs: [{ name: 'encodedPredictedOutcomes', type: 'bytes' }],
    outputs: [
      { name: 'isValid', type: 'bool' },
      { name: 'error', type: 'uint8' },
      { name: 'makerWon', type: 'bool' },
    ],
  },
] as const;
import { useQueryClient } from '@tanstack/react-query';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { usePredictionMarketWriteContract } from '~/hooks/blockchain/usePredictionMarketWriteContract';
import {
  useUserParlays,
  useUserParlaysCount,
  type Parlay,
} from '~/hooks/graphql/useUserParlays';
import NumberDisplay from '~/components/shared/NumberDisplay';
import ShareDialog from '~/components/shared/ShareDialog';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import AwaitingSettlementBadge from '~/components/shared/AwaitingSettlementBadge';
import EnsAvatar from '~/components/shared/EnsAvatar';
import AntiParlayBadge from '~/components/shared/AntiParlayBadge';
import LottieLoader from '~/components/shared/LottieLoader';

function PredictionsScroller({
  legs,
  showAntiParlay,
}: {
  legs: {
    question: string;
    choice: 'Yes' | 'No';
    conditionId?: string;
    endTime?: number | null;
    description?: string | null;
  }[];
  showAntiParlay: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [showRightGradient, setShowRightGradient] = React.useState(false);

  const updateGradientVisibility = React.useCallback(() => {
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

  React.useEffect(() => {
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
    <div className="relative w-full max-w-full xl:max-w-[320px]">
      <div
        ref={containerRef}
        className="overflow-hidden xl:overflow-x-auto whitespace-normal xl:whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex items-start gap-3 pr-0 xl:pr-16 flex-wrap xl:flex-nowrap">
          {showAntiParlay && (
            <div className="shrink-0">
              <AntiParlayBadge />
            </div>
          )}
          {legs.map((l, idx) => (
            <div key={idx} className="flex items-center gap-2 shrink-0">
              <ConditionTitleLink
                conditionId={l.conditionId}
                title={l.question}
                endTime={l.endTime}
                description={l.description}
                clampLines={1}
              />
              <Badge
                variant="outline"
                className={
                  l.choice === 'Yes'
                    ? 'px-1.5 py-0.5 text-xs font-medium !rounded-md border-green-500/40 bg-green-500/10 text-green-600 font-mono'
                    : 'px-1.5 py-0.5 text-xs font-medium !rounded-md border-red-500/40 bg-red-500/10 text-red-600 font-mono'
                }
              >
                {l.choice}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      {showRightGradient && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-brand-black to-transparent group-hover:from-muted/50 transition-colors"
        />
      )}
    </div>
  );
}

function EndsInButton({ endsAtMs }: { endsAtMs: number }) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const isPast = endsAtMs <= nowMs;
  if (isPast) {
    return <AwaitingSettlementBadge />;
  }
  const msLeft = Math.max(0, endsAtMs - nowMs);
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const label =
    daysLeft >= 1 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}` : '<1 day';
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="whitespace-nowrap"
      disabled
    >
      {`Settles in ${label}`}
    </Button>
  );
}

export default function UserParlaysTable({
  account,
  showHeaderText = true,
  chainId,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
}) {
  // ---
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useAccount();
  const hasWallet = Boolean(connectedAddress);
  const [claimingTokenId, setClaimingTokenId] = React.useState<bigint | null>(
    null
  );
  const { burn, isPending: isClaimPending } = usePredictionMarketWriteContract({
    successMessage: 'Claim submitted',
    fallbackErrorMessage: 'Claim failed',
    onSuccess: () => {
      setClaimingTokenId(null);
      const addr = String(account || '').toLowerCase();
      queryClient
        .invalidateQueries({ queryKey: ['userParlays', addr] })
        .catch(() => {});
    },
  });
  type UILeg = {
    question: string;
    choice: 'Yes' | 'No';
    conditionId?: string;
    endTime?: number | null;
    description?: string | null;
  };
  type UIParlay = {
    uniqueRowKey: string;
    positionId: number;
    legs: UILeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // ms
    status: 'active' | 'won' | 'lost';
    tokenIdToClaim?: bigint;
    createdAt: number; // ms
    totalPayoutWei: bigint; // total payout if won
    makerCollateralWei?: bigint; // user's wager if they are maker
    takerCollateralWei?: bigint; // user's wager if they are taker
    userPnL: string; // pnl for settled parlays
    addressRole: 'maker' | 'taker' | 'unknown';
    counterpartyAddress?: Address | null;
    chainId: number;
    marketAddress: Address;
  };

  // Infinite scroll state
  const ITEMS_PER_PAGE = 50;
  const [skip, setSkip] = React.useState(0);
  const [allLoadedData, setAllLoadedData] = React.useState<Parlay[]>([]);
  const [hasMore, setHasMore] = React.useState(true);

  // Sorting state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'created', desc: true },
  ]);

  // Convert sorting state to API params
  const orderBy = sorting[0]?.id;
  const orderDirection = sorting[0]?.desc ? 'desc' : 'asc';

  // Reset when account, sorting, or chainId changes
  React.useEffect(() => {
    setSkip(0);
    setAllLoadedData([]);
    setHasMore(true);
  }, [account, sorting, chainId]);

  // Fetch total count
  const totalCount = useUserParlaysCount(String(account), chainId);

  // Fetch real data with pagination - fetch one extra to detect if there are more pages
  const { data: rawData, isLoading } = useUserParlays({
    address: String(account),
    take: ITEMS_PER_PAGE + 1,
    skip,
    orderBy,
    orderDirection,
    chainId,
  });

  // Append new data when it arrives
  React.useEffect(() => {
    if (!rawData || rawData.length === 0) {
      if (skip === 0) {
        setAllLoadedData([]);
        setHasMore(false);
      }
      return;
    }

    const hasNextPage = rawData.length > ITEMS_PER_PAGE;
    const newItems = hasNextPage ? rawData.slice(0, ITEMS_PER_PAGE) : rawData;

    if (skip === 0) {
      // First load - replace all data
      setAllLoadedData(newItems);
    } else {
      // Subsequent loads - append data
      setAllLoadedData((prev) => [...prev, ...newItems]);
    }

    setHasMore(hasNextPage);
  }, [rawData, skip]);

  // Use accumulated data
  const data = allLoadedData;

  // Load more handler (wrapped in useCallback for IntersectionObserver dependency)
  const handleLoadMore = React.useCallback(() => {
    if (!isLoading && hasMore) {
      setSkip((prev) => prev + ITEMS_PER_PAGE);
    }
  }, [isLoading, hasMore]);

  // ---

  const viewer = React.useMemo(
    () => String(account || '').toLowerCase(),
    [account]
  );
  const rows: UIParlay[] = React.useMemo(() => {
    const parlayRows = (data || []).map((p: any) => {
      const legs: UILeg[] = (p.predictedOutcomes || []).map((o: any) => ({
        question:
          o?.condition?.shortName || o?.condition?.question || o.conditionId,
        choice: o.prediction ? 'Yes' : 'No',
        conditionId: o?.conditionId,
        endTime: o?.condition?.endTime ?? null,
        description: o?.condition?.description ?? null,
      }));
      const endsAtSec =
        p.endsAt ||
        Math.max(
          0,
          ...(p.predictedOutcomes || []).map(
            (o: any) => o?.condition?.endTime || 0
          )
        );
      const userIsMaker =
        typeof p.maker === 'string' && p.maker.toLowerCase() === viewer;
      const userIsTaker =
        typeof p.taker === 'string' && p.taker.toLowerCase() === viewer;
      const isActive = p.status === 'active';
      const userWon =
        !isActive &&
        ((userIsMaker && p.makerWon === true) ||
          (userIsTaker && p.makerWon === false));
      const status: UIParlay['status'] = isActive
        ? 'active'
        : userWon
          ? 'won'
          : 'lost';
      const tokenIdToClaim = userWon
        ? userIsMaker
          ? BigInt(p.makerNftTokenId)
          : BigInt(p.takerNftTokenId)
        : undefined;

      // Calculate PnL for settled parlays
      let userPnL = '0';
      if (
        !isActive &&
        p.makerCollateral &&
        p.takerCollateral &&
        p.totalCollateral
      ) {
        try {
          const makerCollateral = BigInt(p.makerCollateral);
          const takerCollateral = BigInt(p.takerCollateral);
          const totalCollateral = BigInt(p.totalCollateral);

          if (userIsMaker) {
            if (p.makerWon) {
              // Maker won: profit = totalCollateral - makerCollateral
              userPnL = (totalCollateral - makerCollateral).toString();
            } else {
              // Maker lost: loss = -makerCollateral
              userPnL = (-makerCollateral).toString();
            }
          } else if (userIsTaker) {
            if (!p.makerWon) {
              // Taker won: profit = totalCollateral - takerCollateral
              userPnL = (totalCollateral - takerCollateral).toString();
            } else {
              // Taker lost: loss = -takerCollateral
              userPnL = (-takerCollateral).toString();
            }
          }
        } catch (e) {
          console.error('Error calculating parlay PnL:', e);
        }
      }

      // Choose positionId based on the profile address' role
      const positionId = userIsMaker
        ? Number(p.makerNftTokenId)
        : userIsTaker
          ? Number(p.takerNftTokenId)
          : p.makerNftTokenId
            ? Number(p.makerNftTokenId)
            : p.id;
      // Create unique row key combining parlay ID and role
      const uniqueRowKey = `${p.id}-${userIsMaker ? 'maker' : userIsTaker ? 'taker' : 'unknown'}`;
      // Choose wager based on the profile address' role
      const viewerMakerCollateralWei = (() => {
        try {
          return p.makerCollateral ? BigInt(p.makerCollateral) : undefined;
        } catch {
          return undefined;
        }
      })();
      const viewerTakerCollateralWei = (() => {
        try {
          return p.takerCollateral ? BigInt(p.takerCollateral) : undefined;
        } catch {
          return undefined;
        }
      })();
      return {
        uniqueRowKey,
        positionId,
        legs,
        direction: 'Long' as const,
        endsAt: endsAtSec ? endsAtSec * 1000 : Date.now(),
        status,
        tokenIdToClaim,
        createdAt: p.mintedAt ? Number(p.mintedAt) * 1000 : Date.now(),
        totalPayoutWei: (() => {
          try {
            return BigInt(p.totalCollateral || '0');
          } catch {
            return 0n;
          }
        })(),
        makerCollateralWei: viewerMakerCollateralWei,
        takerCollateralWei: viewerTakerCollateralWei,
        userPnL,
        addressRole: userIsMaker
          ? ('maker' as const)
          : userIsTaker
            ? ('taker' as const)
            : ('unknown' as const),
        counterpartyAddress:
          (userIsMaker
            ? (p.taker as Address | undefined)
            : userIsTaker
              ? (p.maker as Address | undefined)
              : undefined) ?? null,
        chainId: Number(p.chainId || DEFAULT_CHAIN_ID),
        marketAddress: p.marketAddress as Address,
      };
    });

    return parlayRows;
  }, [data, viewer]);
  // Detect claimability by checking on-chain ownerOf for the potential claim tokenIds
  const tokenIdsToCheck = React.useMemo(
    () =>
      rows
        .filter((r) => r.status === 'won' && r.tokenIdToClaim !== undefined)
        .map((r) => r.tokenIdToClaim!),
    [rows]
  );
  const ownerReads = React.useMemo(
    () =>
      tokenIdsToCheck.map((tokenId) => ({
        // Fallback to default market address if we can't find a matching row (should not happen)
        address:
          rows.find((r) => r.tokenIdToClaim === tokenId)?.marketAddress ??
          rows[0]?.marketAddress,
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'ownerOf',
        args: [tokenId],
        chainId:
          rows.find((r) => r.tokenIdToClaim === tokenId)?.chainId ||
          DEFAULT_CHAIN_ID,
      })),
    [tokenIdsToCheck, rows]
  );
  const ownersResult = useReadContracts({
    contracts: ownerReads,
    query: { enabled: !isLoading && ownerReads.length > 0 },
  });
  const claimableTokenIds = React.useMemo(() => {
    const set = new Set<string>();
    const viewerAddr = String(account || '').toLowerCase();
    const items = ownersResult?.data || [];
    items.forEach((item, idx) => {
      if (item && item.status === 'success') {
        const owner = String(item.result || '').toLowerCase();
        if (owner && owner === viewerAddr) {
          set.add(String(tokenIdsToCheck[idx]));
        }
      }
    });
    return set;
  }, [ownersResult?.data, tokenIdsToCheck, account]);

  // On-chain resolution for active rows that have passed end time
  type ChainResolutionState =
    | { state: 'awaiting' }
    | { state: 'claim'; tokenId: bigint }
    | { state: 'lost' }
    | { state: 'claimed' };

  const nowMs = Date.now();
  const rowsNeedingResolution = React.useMemo(() => {
    return rows.filter(
      (r) =>
        r.status === 'active' &&
        r.endsAt <= nowMs &&
        r.addressRole !== 'unknown'
    );
  }, [rows, nowMs]);

  const viewerTokenInfo = React.useMemo(
    () =>
      rowsNeedingResolution.map((r) => ({
        rowKey: r.positionId,
        tokenId:
          r.addressRole === 'maker'
            ? BigInt(r.positionId) // positionId chosen from maker/taker id earlier
            : BigInt(r.positionId),
        // Note: positionId was set to the viewer-relevant NFT id earlier
        marketAddress: r.marketAddress,
        chainId: r.chainId,
      })),
    [rowsNeedingResolution]
  );

  // Phase 1: ownerOf(viewerTokenId)
  const activeOwnerReads = React.useMemo(
    () =>
      viewerTokenInfo.map((info) => ({
        address: info.marketAddress,
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'ownerOf',
        args: [info.tokenId],
        chainId: info.chainId,
      })),
    [viewerTokenInfo]
  );
  const activeOwners = useReadContracts({
    contracts: activeOwnerReads,
    query: { enabled: !isLoading && activeOwnerReads.length > 0 },
  });

  // Derive which rows are still owned by the viewer
  const ownedRowEntries = React.useMemo(() => {
    const out: {
      rowKey: number;
      tokenId: bigint;
      marketAddress: Address;
      chainId: number;
    }[] = [];
    const items = activeOwners?.data || [];
    const viewerAddr = viewer;
    items.forEach((item, idx) => {
      const info = viewerTokenInfo[idx];
      if (!info) return;
      if (item && item.status === 'success') {
        const owner = String(item.result || '').toLowerCase();
        if (owner && owner === viewerAddr) {
          out.push({
            rowKey: info.rowKey,
            tokenId: info.tokenId,
            marketAddress: info.marketAddress,
            chainId: info.chainId,
          });
        }
      }
    });
    return out;
  }, [activeOwners?.data, viewer, viewerTokenInfo]);

  // Phase 2: getPrediction(tokenId) to obtain resolver + encodedPredictedOutcomes
  const getPredictionReads = React.useMemo(
    () =>
      ownedRowEntries.map((e) => ({
        address: e.marketAddress,
        abi: predictionMarketAbi as unknown as Abi,
        functionName: 'getPrediction',
        args: [e.tokenId],
        chainId: e.chainId,
      })),
    [ownedRowEntries]
  );
  const predictionDatas = useReadContracts({
    contracts: getPredictionReads,
    query: { enabled: !isLoading && getPredictionReads.length > 0 },
  });

  // Phase 3: resolver.resolvePrediction(encodedPredictedOutcomes)
  const resolverReads = React.useMemo(() => {
    const calls: any[] = [];
    const preds = predictionDatas?.data || [];
    preds.forEach((item: any, idx: number) => {
      if (!item || item.status !== 'success') return;
      try {
        const result = item.result;
        const resolver: Address = result.resolver as Address;
        const encoded = result.encodedPredictedOutcomes as `0x${string}`;
        const base = ownedRowEntries[idx];
        if (resolver && encoded && base) {
          calls.push({
            address: resolver,
            abi: UMA_RESOLVER_MIN_ABI as unknown as Abi,
            functionName: 'resolvePrediction',
            args: [encoded],
            chainId: base.chainId,
          });
        }
      } catch {
        // ignore mis-shaped result
      }
    });
    return calls;
  }, [predictionDatas?.data, ownedRowEntries]);
  const resolverResults = useReadContracts({
    contracts: resolverReads,
    query: { enabled: !isLoading && resolverReads.length > 0 },
  });

  // Build a map from rowKey -> ChainResolutionState
  const rowKeyToResolution = React.useMemo(() => {
    const map = new Map<number, ChainResolutionState>();
    // default: if we attempted ownerOf but do not own, consider 'claimed'
    viewerTokenInfo.forEach((info, idx) => {
      const ownerItem = activeOwners?.data?.[idx];
      if (!ownerItem || ownerItem.status !== 'success') return;
      const owner = String(ownerItem.result || '').toLowerCase();
      if (!owner || owner !== viewer) {
        map.set(info.rowKey, { state: 'claimed' });
      }
    });

    const res = resolverResults?.data || [];
    for (let i = 0; i < res.length; i++) {
      const base = ownedRowEntries[i];
      const resItem = res[i];
      if (!base || !resItem) continue;
      const rowKey = base.rowKey;
      if (resItem.status !== 'success') {
        // couldn't resolve yet → awaiting
        if (!map.has(rowKey)) map.set(rowKey, { state: 'awaiting' });
        continue;
      }
      try {
        const tuple = resItem.result as any; // [isValid, error, makerWon]
        const isValid = Boolean(tuple?.[0]);
        const makerWon = Boolean(tuple?.[2]);
        if (!isValid) {
          map.set(rowKey, { state: 'awaiting' });
          continue;
        }
        // Determine if viewer is winner
        const row = rows.find((r) => r.positionId === rowKey);
        if (!row) continue;
        const viewerIsMaker = row.addressRole === 'maker';
        const viewerWon = viewerIsMaker ? makerWon : !makerWon;
        map.set(
          rowKey,
          viewerWon
            ? { state: 'claim', tokenId: base.tokenId }
            : { state: 'lost' }
        );
      } catch {
        if (!map.has(rowKey)) map.set(rowKey, { state: 'awaiting' });
      }
    }
    return map;
  }, [
    viewerTokenInfo,
    activeOwners?.data,
    resolverResults?.data,
    predictionDatas?.data,
    rows,
    viewer,
  ]);

  // Keep Share dialog open state outside of row to survive re-renders
  const [openShareParlayId, setOpenShareParlayId] = React.useState<
    number | null
  >(null);
  const selectedParlay = React.useMemo(() => {
    if (openShareParlayId === null) return null;
    return rows.find((r) => r.positionId === openShareParlayId) || null;
  }, [rows, openShareParlayId]);
  // ---

  const columns = React.useMemo<ColumnDef<UIParlay>[]>(
    () => [
      {
        id: 'created',
        accessorFn: (row) => row.createdAt,
        size: 300,
        minSize: 0,
        maxSize: 300,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Created
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const createdDate = new Date(row.original.createdAt);
          const createdDisplay = formatDistanceToNow(createdDate, {
            addSuffix: true,
          });
          const exactLocalDisplay = createdDate.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          });
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Created
              </div>
              <div className="text-[15px] leading-[1.35] tracking-[-0.01em] mb-0.5 whitespace-nowrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{createdDisplay}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div>{exactLocalDisplay}</div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">{`Position #${row.original.positionId}`}</div>
            </div>
          );
        },
      },
      {
        id: 'conditions',
        accessorFn: (row) => row.legs.length,
        enableSorting: false,
        size: 400,
        minSize: 300,
        header: () => <span>Predictions</span>,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Predictions
            </div>
            <PredictionsScroller
              legs={row.original.legs}
              showAntiParlay={row.original.addressRole === 'taker'}
            />
          </div>
        ),
      },

      {
        id: 'counterparty',
        accessorFn: (row) => row.counterpartyAddress ?? null,
        enableSorting: false,
        size: 220,
        minSize: 160,
        header: () => <span>Counterparty</span>,
        cell: ({ row }) => (
          <div>
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Counterparty
            </div>
            {row.original.counterpartyAddress ? (
              <div className="whitespace-nowrap text-[15px]">
                <div className="flex items-center gap-2">
                  <EnsAvatar
                    address={row.original.counterpartyAddress}
                    className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                    width={20}
                    height={20}
                  />
                  <AddressDisplay
                    address={row.original.counterpartyAddress}
                    className="text-[15px]"
                  />
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
      },

      {
        id: 'wager',
        accessorFn: (row) => {
          // Show the viewer's contributed collateral as the wager
          const viewerWagerWei =
            row.addressRole === 'maker'
              ? (row.makerCollateralWei ?? 0n)
              : row.addressRole === 'taker'
                ? (row.takerCollateralWei ?? 0n)
                : (row.makerCollateralWei ?? row.takerCollateralWei ?? 0n);
          return Number(formatEther(viewerWagerWei));
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Wager
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = 'testUSDe';
          const viewerWagerWei =
            row.original.addressRole === 'maker'
              ? (row.original.makerCollateralWei ?? 0n)
              : row.original.addressRole === 'taker'
                ? (row.original.takerCollateralWei ?? 0n)
                : (row.original.makerCollateralWei ??
                  row.original.takerCollateralWei ??
                  0n);
          const viewerWager = Number(formatEther(viewerWagerWei));

          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Wager
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <NumberDisplay
                  value={viewerWager}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'toWin',
        accessorFn: (row) => {
          const totalPayout = Number(formatEther(row.totalPayoutWei || 0n));
          // For sorting, treat lost as 0
          if (row.status === 'lost') return 0;
          return totalPayout;
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            To Win
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = 'testUSDe';
          const totalPayout = Number(
            formatEther(row.original.totalPayoutWei || 0n)
          );
          if (
            row.original.status === 'lost' ||
            rowKeyToResolution.get(row.original.positionId)?.state === 'lost'
          ) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  To Win
                </div>
                <span className="text-muted-foreground">Wager Lost</span>
              </div>
            );
          }
          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                To Win
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <NumberDisplay
                  value={totalPayout}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'pnl',
        accessorFn: (row) => {
          const pnlValue = Number(formatEther(BigInt(row.userPnL || '0')));
          return pnlValue;
        },
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Profit/Loss
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const symbol = 'testUSDe';
          const isClosed = row.original.status !== 'active';
          const lostParlayUnclaimed =
            row.original.status === 'active' &&
            rowKeyToResolution.get(row.original.positionId)?.state === 'lost';

          if (!isClosed && !lostParlayUnclaimed) {
            return (
              <div>
                <div className="xl:hidden text-xs text-muted-foreground mb-1">
                  Profit/Loss
                </div>
                <span className="text-muted-foreground">Pending</span>
              </div>
            );
          }

          const viewerWagerWei =
            row.original.addressRole === 'maker'
              ? (row.original.makerCollateralWei ?? 0n)
              : row.original.addressRole === 'taker'
                ? (row.original.takerCollateralWei ?? 0n)
                : (row.original.makerCollateralWei ??
                  row.original.takerCollateralWei ??
                  0n);
          const viewerWager = Number(formatEther(viewerWagerWei));

          const pnlValue = lostParlayUnclaimed
            ? -viewerWager
            : Number(formatEther(BigInt(row.original.userPnL || '0')));

          const roi = viewerWager > 0 ? (pnlValue / viewerWager) * 100 : 0;

          return (
            <div>
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Profit/Loss
              </div>
              <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
                <span className="tabular-nums text-brand-white font-mono">
                  {pnlValue < 0 ? '-' : ''}
                </span>
                <NumberDisplay
                  value={Math.abs(pnlValue)}
                  className="tabular-nums text-brand-white font-mono"
                />{' '}
                <span className="tabular-nums text-brand-white font-mono">
                  {symbol}
                </span>
              </div>
              {viewerWager > 0 && (
                <div
                  className={`text-xs tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  ({roi >= 0 ? '+' : ''}
                  {roi.toFixed(2)}%)
                </div>
              )}
            </div>
          );
        },
      },

      {
        id: 'actions',
        enableSorting: false,
        size: 140,
        minSize: 100,
        header: () => null,
        cell: ({ row }) => (
          <div className="whitespace-nowrap xl:mt-0">
            <div className="flex items-center gap-2 justify-start xl:justify-end">
              {row.original.status === 'active' &&
                row.original.endsAt > Date.now() && (
                  <EndsInButton endsAtMs={row.original.endsAt} />
                )}
              {row.original.status === 'active' &&
                row.original.endsAt <= Date.now() &&
                row.original.addressRole !== 'unknown' &&
                (() => {
                  const res = rowKeyToResolution.get(row.original.positionId);
                  if (!res) return <AwaitingSettlementBadge />;
                  if (res.state === 'awaiting')
                    return <AwaitingSettlementBadge />;
                  if (res.state === 'claim') {
                    const isOwnerConnected =
                      connectedAddress &&
                      connectedAddress.toLowerCase() ===
                        String(account || '').toLowerCase();
                    const isThisTokenClaiming =
                      isClaimPending && claimingTokenId === res.tokenId;
                    return isOwnerConnected ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setClaimingTokenId(res.tokenId);
                          burn(res.tokenId, ZERO_REF_CODE);
                        }}
                        disabled={isClaimPending}
                      >
                        {isThisTokenClaiming ? 'Claiming...' : 'Claim Winnings'}
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled>
                                Claim Winnings
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[220px]">
                              {hasWallet
                                ? 'You can only claim winnings from the account that owns this parlay.'
                                : 'Connect your account to claim this parlay.'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                  if (res.state === 'lost') {
                    return (
                      <Button size="sm" variant="outline" disabled>
                        Wager Lost
                      </Button>
                    );
                  }
                  return (
                    <Button size="sm" variant="outline" disabled>
                      Claimed
                    </Button>
                  );
                })()}
              {row.original.status === 'won' &&
                row.original.tokenIdToClaim !== undefined &&
                claimableTokenIds.has(String(row.original.tokenIdToClaim)) &&
                (() => {
                  const isOwnerConnected =
                    connectedAddress &&
                    connectedAddress.toLowerCase() ===
                      String(account || '').toLowerCase();
                  const isThisTokenClaiming =
                    isClaimPending &&
                    claimingTokenId === row.original.tokenIdToClaim;
                  return isOwnerConnected ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setClaimingTokenId(row.original.tokenIdToClaim!);
                        burn(row.original.tokenIdToClaim!, ZERO_REF_CODE);
                      }}
                      disabled={isClaimPending}
                    >
                      {isThisTokenClaiming ? 'Claiming...' : 'Claim Winnings'}
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Claim Winnings
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-[220px]">
                            {hasWallet
                              ? 'You can only claim winnings from the account that owns this parlay.'
                              : 'Connect your account to claim this parlay.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              {row.original.status === 'won' &&
                (row.original.tokenIdToClaim === undefined ||
                  !claimableTokenIds.has(
                    String(row.original.tokenIdToClaim)
                  )) && (
                  <Button size="sm" variant="outline" disabled>
                    Claimed
                  </Button>
                )}
              {row.original.status === 'lost' && (
                <Button size="sm" variant="outline" disabled>
                  Wager Lost
                </Button>
              )}
              {(() => {
                // Hide Share button when a lost state is displayed
                const res = rowKeyToResolution.get(row.original.positionId);
                const isLostDisplayed =
                  row.original.status === 'lost' || res?.state === 'lost';
                if (isLostDisplayed) return null;
                return (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                    onClick={() =>
                      setOpenShareParlayId(row.original.positionId)
                    }
                  >
                    Share
                  </button>
                );
              })()}
            </div>
          </div>
        ),
      },
    ],
    [
      isClaimPending,
      burn,
      account,
      rowKeyToResolution,
      claimableTokenIds,
      connectedAddress,
      hasWallet,
    ]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, // Disable client-side sorting, we're doing server-side sorting
    columnResizeMode: 'onChange',
    enableColumnResizing: false,
    getRowId: (row) => row.uniqueRowKey,
  });

  // Claim button is inlined per row using shared hook to avoid many hook instances

  // Auto-load more when scrolling near bottom
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          handleLoadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px', // Start loading 100px before the element is visible
      }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoading, handleLoadMore]);

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      {rows.length === 0 && !isLoading ? (
        <EmptyTabState centered message="No parlays found" />
      ) : isLoading && rows.length === 0 ? (
        <div className="w-full min-h-[300px] flex items-center justify-center">
          <LottieLoader width={12} height={12} />
        </div>
      ) : (
        <>
          <div className="border-y border-border rounded-none overflow-hidden bg-brand-black relative">
            {isLoading && (
              <div className="absolute inset-0 bg-brand-black/50 flex items-center justify-center z-10">
                <LottieLoader width={12} height={12} />
              </div>
            )}
            <Table className="table-auto">
              <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          header.id === 'actions' ? 'text-right' : undefined
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="group xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`block xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${cell.column.id === 'actions' ? 'text-left xl:text-right xl:mt-0' : ''}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Infinite scroll sentinel - triggers auto-load when visible */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center px-4 py-6 border-b border-border bg-brand-black"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LottieLoader width={24} height={24} />
                  <span className="text-sm text-muted-foreground">
                    Loading more parlays...
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Scroll to load more • {data.length} of {totalCount}
                </span>
              )}
            </div>
          )}
        </>
      )}
      {selectedParlay && (
        <ShareDialog
          question={`Parlay #${selectedParlay.positionId}`}
          legs={selectedParlay.legs?.map((l) => ({
            question: l.question,
            choice: l.choice,
          }))}
          wager={Number(
            formatEther(
              selectedParlay.makerCollateralWei ??
                selectedParlay.takerCollateralWei ??
                0n
            )
          )}
          payout={Number(formatEther(selectedParlay.totalPayoutWei || 0n))}
          symbol="USDe"
          owner={String(account)}
          imagePath="/og/parlay"
          extraParams={
            selectedParlay.addressRole === 'taker' ? { anti: '1' } : undefined
          }
          open={openShareParlayId !== null}
          onOpenChange={(next) => {
            if (!next) setOpenShareParlayId(null);
          }}
          trigger={<span />}
          title="Share Your Parlay"
        />
      )}
    </div>
  );
}
