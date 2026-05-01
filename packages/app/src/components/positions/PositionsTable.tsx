'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Info, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useAccount } from 'wagmi';
import EmptyTabState from '~/components/shared/EmptyTabState';
import TableLoadingState from '~/components/shared/TableLoadingState';
import InfiniteScrollFooter from '~/components/shared/InfiniteScrollFooter';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';

import CountdownCell from '~/components/shared/CountdownCell';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '~/components/positions/toPickLegs';
import {
  usePositionBalances,
  usePositionBalancesByConditionId,
  type PositionBalance,
} from '~/hooks/graphql/usePositions';
import PicksSummary from '~/components/shared/PicksSummary';
import LegacyBadge from '~/components/shared/LegacyBadge';
import PositionDialog from '~/components/positions/PositionDialog';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import {
  PositionsTableFilters,
  getDefaultPositionsFilterState,
  type PositionsFilterState,
} from '~/components/positions/PositionsTableFilters';
import {
  isWithinDateRange,
  matchesConditionSearch,
} from '~/lib/utils/tableFilters';
import { useEscrowWrite } from '~/hooks/blockchain/useEscrowWrite';
import { useClaimableAmount } from '~/hooks/blockchain/useEscrowContract';
import { useSession } from '~/lib/context/SessionContext';
import SellPositionDialog from '~/components/secondary/SellPositionDialog';

// Render an ROI percentage with sign. Sub-1%-magnitude non-zero values
// collapse to "<1%" so a 0.4% gain doesn't render as "+0%". Color carries
// the direction at the call site, so the sign on tiny values is omitted.
const formatRoi = (roi: number): string => {
  if (roi !== 0 && Math.abs(roi) < 1) return '<1%';
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${Math.round(roi).toLocaleString()}%`;
};

function PositionRow({
  position,
  collateralSymbol,
  conditionsMap,
  onShare,
  onOpenDialog,
  onRefetch,
}: {
  position: PositionBalance;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  onShare: (position: PositionBalance) => void;
  onOpenDialog: () => void;
  onRefetch?: () => void;
}) {
  const { pickConfig, isPredictorToken } = position;
  const rawPicks = pickConfig?.picks ?? [];
  const picks = toPicks(rawPicks, isPredictorToken, conditionsMap);
  const { effectiveAddress, smartAccountAddress } = useSession();
  const { address: walletAddress } = useAccount();

  // Show action buttons if the connected wallet (EOA or Smart Account) owns this position
  const holderLower = position.holder?.toLowerCase();
  const isOwnPosition =
    !!holderLower &&
    (effectiveAddress?.toLowerCase() === holderLower ||
      smartAccountAddress?.toLowerCase() === holderLower ||
      walletAddress?.toLowerCase() === holderLower);

  // Position size = user's deposited collateral (from Prediction records)
  const positionSizeFormatted = parseFloat(
    formatEther(BigInt(position.userCollateral || '0'))
  );

  // Payout = total collateral in the user's prediction(s)
  const payoutFormatted = parseFloat(
    formatEther(BigInt(position.totalPayout || '0'))
  );

  // Use on-chain result if resolved, otherwise compute from individual conditions
  const onChainResolved = pickConfig?.resolved ?? false;
  const computed = !onChainResolved
    ? computeResultFromConditions(rawPicks, conditionsMap)
    : null;
  const result = onChainResolved
    ? (pickConfig?.result ?? 'UNRESOLVED')
    : (computed?.result ?? 'UNRESOLVED');
  const isResolved = onChainResolved || result !== 'UNRESOLVED';

  const holderWon =
    isResolved &&
    ((isPredictorToken && result === 'PREDICTOR_WINS') ||
      (!isPredictorToken && result === 'COUNTERPARTY_WINS'));

  const holderLost =
    isResolved &&
    ((isPredictorToken && result === 'COUNTERPARTY_WINS') ||
      (!isPredictorToken && result === 'PREDICTOR_WINS'));

  // Synthetic sell rows have ids like `${dbId}-sell-${tradeHash}`; the open
  // / parent row is just `${dbId}`.
  const isSoldRow = position.id.includes('-sell-');
  const isClosed = !isResolved && BigInt(position.balance) === 0n;
  const realizedPnLFormatted =
    position.realizedPnL != null
      ? parseFloat(formatEther(BigInt(position.realizedPnL)))
      : null;

  // PnL: profit if won (payout - positionSize), loss if lost (-positionSize),
  // or the resolver-computed realized value for closed-but-unresolved positions.
  const pnlValue = isResolved
    ? holderWon
      ? payoutFormatted - positionSizeFormatted
      : -positionSizeFormatted
    : isClosed
      ? realizedPnLFormatted
      : null;
  const roi =
    pnlValue !== null && positionSizeFormatted > 0
      ? (pnlValue / positionSizeFormatted) * 100
      : 0;

  // Claim / redeem state
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [redeemed, setRedeemed] = React.useState(false);
  const escrowAddress = (pickConfig?.marketAddress as Address) ?? undefined;
  const { settleAndRedeem } = useEscrowWrite({
    chainId: position.chainId,
    escrowAddress,
  });

  const { isLoading: isLoadingClaimable } = useClaimableAmount({
    pickConfigId: pickConfig?.id as `0x${string}`,
    tokenAddress: position.tokenAddress as Address,
    amount: BigInt(position.balance),
    chainId: position.chainId,
    contractAddress: escrowAddress,
    enabled:
      isResolved &&
      holderWon &&
      !!isOwnPosition &&
      BigInt(position.balance) > 0n,
  });

  const handleClaim = React.useCallback(async () => {
    if (!position.tokenAddress || BigInt(position.balance) <= 0n) return;
    const predictionId = pickConfig?.predictionId;
    if (!predictionId) return;
    setIsRedeeming(true);
    try {
      const redeemResult = await settleAndRedeem({
        predictionId: predictionId as `0x${string}`,
        positionToken: position.tokenAddress as Address,
        amount: BigInt(position.balance),
      });
      if (redeemResult.success) {
        setRedeemed(true);
        onRefetch?.();
      }
    } finally {
      setIsRedeeming(false);
    }
  }, [position, pickConfig, settleAndRedeem, onRefetch]);

  // Determine what to show in P/L column
  const renderPnlCell = () => {
    // Already redeemed in this session
    if (redeemed && pnlValue !== null) {
      return (
        <div
          className={`whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 ${pnlValue >= 0 ? 'text-green-500' : 'text-red-500'}`}
        >
          <NumberDisplay
            value={pnlValue}
            className={`tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-500' : 'text-red-500'}`}
          />{' '}
          <span className={pnlValue >= 0 ? 'text-green-500' : 'text-red-500'}>
            {collateralSymbol}
          </span>
          {positionSizeFormatted > 0 && (
            <span
              className={`text-[10px] leading-tight tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {formatRoi(roi)}
            </span>
          )}
        </div>
      );
    }

    // Resolved, viewer won, and it's our position → show CLAIM link
    if (
      isResolved &&
      holderWon &&
      isOwnPosition &&
      BigInt(position.balance) > 0n
    ) {
      return (
        <button
          type="button"
          className={`btn-get-access inline-flex items-center justify-center rounded-md h-9 text-sm text-brand-black hover:text-white font-semibold border-0 transition-colors duration-400 font-mono uppercase whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${isRedeeming ? 'px-4 tracking-normal' : 'px-5 tracking-widest'}`}
          onClick={handleClaim}
          disabled={isRedeeming || isLoadingClaimable}
        >
          <span className="relative z-10">
            {isRedeeming ? 'Claiming...' : 'CLAIM'}
          </span>
        </button>
      );
    }

    // Resolved, viewer won, viewing someone else's profile → show green PnL (no claim button)
    if (isResolved && holderWon) {
      return (
        <div className="whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 text-green-500">
          <NumberDisplay
            value={pnlValue ?? 0}
            className="tabular-nums font-mono text-green-500"
          />{' '}
          <span className="text-green-500">{collateralSymbol}</span>
          {positionSizeFormatted > 0 && (
            <span className="text-[10px] leading-tight tabular-nums font-mono text-green-500">
              {formatRoi(roi)}
            </span>
          )}
        </div>
      );
    }

    // Resolved, viewer lost → show realized PnL in red
    if (isResolved && holderLost) {
      return (
        <div className="whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 text-red-500">
          <NumberDisplay
            value={-positionSizeFormatted}
            className="tabular-nums font-mono text-red-500"
          />{' '}
          <span className="text-red-500">{collateralSymbol}</span>
          <span className="text-[10px] leading-tight tabular-nums font-mono text-red-500">
            -100%
          </span>
        </div>
      );
    }

    // Closed (balance=0, unresolved) → realized PnL from secondary trades + claims
    if (isClosed && pnlValue !== null) {
      const colorClass =
        pnlValue > 0
          ? 'text-green-500'
          : pnlValue < 0
            ? 'text-red-500'
            : 'text-muted-foreground';
      return (
        <div
          className={`whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 ${colorClass}`}
        >
          <NumberDisplay
            value={pnlValue}
            className={`tabular-nums font-mono ${colorClass}`}
          />{' '}
          <span className={colorClass}>{collateralSymbol}</span>
          {positionSizeFormatted > 0 && (
            <span
              className={`text-[10px] leading-tight tabular-nums font-mono ${colorClass}`}
            >
              {formatRoi(roi)}
            </span>
          )}
        </div>
      );
    }

    // Not resolved → PENDING + optional Sell button
    return (
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
          PENDING
        </span>
        {isOwnPosition && BigInt(position.balance) > 0n && (
          <SellPositionDialog position={position} onSuccess={onRefetch}>
            <button
              type="button"
              className="inline-flex items-center justify-center h-7 px-2.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sell
            </button>
          </SellPositionDialog>
        )}
      </div>
    );
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <PicksSummary
            picks={picks}
            predictionId={pickConfig?.predictionId}
            onClick={onOpenDialog}
          />
          {pickConfig?.isLegacy && <LegacyBadge />}
          {isSoldRow && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono uppercase border border-muted-foreground/40 bg-muted/20 text-muted-foreground">
              SOLD
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <NumberDisplay
          value={positionSizeFormatted}
          appendedText={collateralSymbol}
          className="text-brand-white font-mono"
        />
      </TableCell>
      <TableCell>
        <NumberDisplay
          value={payoutFormatted}
          appendedText={collateralSymbol}
          className="text-brand-white font-mono"
        />
      </TableCell>
      {/* Profit/Loss → PENDING / CLAIM / Realized PnL */}
      <TableCell>{renderPnlCell()}</TableCell>
      {/* Ends */}
      <TableCell className="whitespace-nowrap">
        {(() => {
          const closedWithProfit =
            isClosed && pnlValue !== null && pnlValue > 0;
          const closedWithLoss = isClosed && pnlValue !== null && pnlValue < 0;
          if ((isResolved && holderWon) || closedWithProfit) {
            return (
              <span className="whitespace-nowrap font-mono uppercase text-green-500">
                WON
              </span>
            );
          }
          if ((isResolved && holderLost) || closedWithLoss) {
            return (
              <span className="whitespace-nowrap font-mono uppercase text-red-500">
                LOST
              </span>
            );
          }
          const endsAt = Math.max(
            0,
            ...rawPicks.map(
              (p) => conditionsMap.get(p.conditionId)?.endTime ?? 0
            )
          );
          if (!endsAt) return <span className="text-muted-foreground">—</span>;
          const endsAtMs = endsAt * 1000;
          if (endsAtMs > Date.now()) {
            return <CountdownCell endTime={endsAt} />;
          }
          if (!isResolved) {
            return (
              <span className="whitespace-nowrap font-mono text-accent-gold">
                ENDS SOON
              </span>
            );
          }
          return (
            <span className="text-brand-white text-sm">
              {formatDistanceToNow(new Date(endsAtMs), { addSuffix: true })}
            </span>
          );
        })()}
      </TableCell>
      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
            onClick={() => onShare(position)}
          >
            Share
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type SortKey = 'updatedAt' | 'positionSize' | 'payout' | 'pnl' | 'ends';
type SortDir = 'asc' | 'desc';
type SortState = { key: SortKey; dir: SortDir };

const DEFAULT_SORT_DIRS: Record<SortKey, SortDir> = {
  updatedAt: 'desc',
  positionSize: 'desc',
  payout: 'desc',
  pnl: 'desc',
  ends: 'asc',
};

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: React.ReactNode;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground text-muted-foreground"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active ? (
        sort.dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

export default function PositionsTable({
  account,
  conditionId,
  showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account?: Address;
  conditionId?: string;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  const collateralSymbol =
    COLLATERAL_SYMBOLS[chainId || DEFAULT_CHAIN_ID] || 'USDe';
  const [filters, setFilters] = React.useState<PositionsFilterState>(
    getDefaultPositionsFilterState
  );

  // Derive server-side `settled` filter from status selection.
  // Only 'active' → settled=false; only 'won'/'lost' → settled=true; mixed → undefined
  const serverSettled = React.useMemo(() => {
    const s = filters.status;
    if (s.length === 0 || s.length === 3) return undefined;
    const hasActive = s.includes('active');
    const hasResolved = s.includes('won') || s.includes('lost');
    if (hasActive && !hasResolved) return false;
    if (hasResolved && !hasActive) return true;
    return undefined;
  }, [filters.status]);

  // Fetch position balances for this user
  const {
    data: accountPositions,
    isLoading: accountLoading,
    isFetchingMore: accountFetchingMore,
    hasMore: accountHasMore,
    fetchMore: accountFetchMore,
    error: accountError,
    refetch: accountRefetch,
  } = usePositionBalances({
    holder: account,
    chainId,
    settled: serverSettled,
  });

  // Fetch position balances for a condition (all holders)
  const {
    data: conditionPositions,
    isLoading: conditionLoading,
    isFetchingMore: conditionFetchingMore,
    hasMore: conditionHasMore,
    fetchMore: conditionFetchMore,
    error: conditionError,
    refetch: conditionRefetch,
  } = usePositionBalancesByConditionId({
    conditionId: !account ? conditionId : undefined,
    settled: serverSettled,
  });

  const positions = account ? accountPositions : conditionPositions;
  const isLoading = account ? accountLoading : conditionLoading;
  const isFetchingMore = account ? accountFetchingMore : conditionFetchingMore;
  const hasMore = account ? accountHasMore : conditionHasMore;
  const fetchMore = account ? accountFetchMore : conditionFetchMore;
  const error = account ? accountError : conditionError;
  const refetch = account ? accountRefetch : conditionRefetch;

  const { loadMoreRef } = useInfiniteScroll({
    hasMore,
    isLoading,
    isFetchingMore,
    onFetchMore: fetchMore,
  });

  // Build the condition map from the inline `picks.condition` data the
  // server pre-loads. Avoids the second-round-trip waterfall the previous
  // `useConditionsByIds(conditionIds)` call produced.
  const conditionsMap: ConditionsMap = React.useMemo(() => {
    const m: ConditionsMap = new Map();
    for (const p of positions) {
      for (const pick of p.pickConfig?.picks ?? []) {
        if (pick.condition && !m.has(pick.conditionId)) {
          m.set(pick.conditionId, pick.condition);
        }
      }
    }
    return m;
  }, [positions]);

  // Apply client-side filters
  const filteredPositions = React.useMemo(() => {
    let result = positions;

    // Filter by search term
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim();
      result = result.filter((p) => {
        const ids = (p.pickConfig?.picks ?? []).map((pk) => pk.conditionId);
        return matchesConditionSearch(term, ids, conditionsMap);
      });
    }

    // Filter by status (using per-condition resolution for early results)
    if (filters.status.length > 0 && filters.status.length < 3) {
      result = result.filter((p) => {
        const onChainResolved = p.pickConfig?.resolved ?? false;
        const picks = p.pickConfig?.picks ?? [];
        const computed = !onChainResolved
          ? computeResultFromConditions(picks, conditionsMap)
          : null;
        const res = onChainResolved
          ? (p.pickConfig?.result ?? 'UNRESOLVED')
          : (computed?.result ?? 'UNRESOLVED');
        const resolved = onChainResolved || res !== 'UNRESOLVED';

        if (!resolved) return filters.status.includes('active');
        const holderWon =
          (p.isPredictorToken && res === 'PREDICTOR_WINS') ||
          (!p.isPredictorToken && res === 'COUNTERPARTY_WINS');
        if (holderWon) return filters.status.includes('won');
        return filters.status.includes('lost');
      });
    }

    // Filter by position size range
    if (filters.valueRange[0] > 0 || filters.valueRange[1] < Infinity) {
      result = result.filter((p) => {
        const balanceEth = parseFloat(
          formatEther(BigInt(p.userCollateral || p.balance))
        );
        return (
          balanceEth >= filters.valueRange[0] &&
          balanceEth <= filters.valueRange[1]
        );
      });
    }

    // Filter by date range (end time relative to now)
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      result = result.filter((p) => {
        const rawPicks = p.pickConfig?.picks ?? [];
        const endsAt = Math.max(
          0,
          ...rawPicks.map(
            (pk) => conditionsMap.get(pk.conditionId)?.endTime ?? 0
          )
        );
        if (!endsAt) return true; // no end time, don't filter out
        return isWithinDateRange(endsAt * 1000, filters.dateRange);
      });
    }

    return result;
  }, [positions, filters, conditionsMap]);

  // Sorting
  const [sort, setSort] = React.useState<SortState | null>(null);
  const handleSort = React.useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: DEFAULT_SORT_DIRS[key] };
    });
  }, []);

  const sortedPositions = React.useMemo(() => {
    if (!sort) return filteredPositions;
    const { key, dir } = sort;
    const multiplier = dir === 'asc' ? 1 : -1;
    const getValue = (p: PositionBalance): number => {
      const rawPicks = p.pickConfig?.picks ?? [];
      const size = parseFloat(formatEther(BigInt(p.userCollateral || '0')));
      const payout = parseFloat(formatEther(BigInt(p.totalPayout || '0')));
      switch (key) {
        case 'updatedAt':
          return new Date(p.updatedAt).getTime();
        case 'positionSize':
          return size;
        case 'payout':
          return payout;
        case 'pnl': {
          const onChainResolved = p.pickConfig?.resolved ?? false;
          const computed = !onChainResolved
            ? computeResultFromConditions(rawPicks, conditionsMap)
            : null;
          const res = onChainResolved
            ? (p.pickConfig?.result ?? 'UNRESOLVED')
            : (computed?.result ?? 'UNRESOLVED');
          const isResolved = onChainResolved || res !== 'UNRESOLVED';
          if (!isResolved) return 0;
          const holderWon =
            (p.isPredictorToken && res === 'PREDICTOR_WINS') ||
            (!p.isPredictorToken && res === 'COUNTERPARTY_WINS');
          return holderWon ? payout - size : -size;
        }
        case 'ends': {
          const endsAt = Math.max(
            0,
            ...rawPicks.map(
              (pk) => conditionsMap.get(pk.conditionId)?.endTime ?? 0
            )
          );
          // Missing end time sinks to the bottom regardless of direction
          return endsAt === 0 ? Number.POSITIVE_INFINITY : endsAt;
        }
      }
    };
    return [...filteredPositions].sort(
      (a, b) => (getValue(a) - getValue(b)) * multiplier
    );
  }, [filteredPositions, sort, conditionsMap]);

  // Share dialog state
  const [sharePosition, setSharePosition] =
    React.useState<PositionBalance | null>(null);

  // Prediction detail dialog state
  const [dialogPosition, setDialogPosition] =
    React.useState<PositionBalance | null>(null);

  // Build OG image URL for position sharing
  const shareImageSrc = React.useMemo(() => {
    if (!sharePosition) return null;
    const { pickConfig, isPredictorToken } = sharePosition;
    const rawPicks = pickConfig?.picks ?? [];
    const resolvedPicks = toPicks(rawPicks, isPredictorToken, conditionsMap);

    const wager = parseFloat(
      formatEther(BigInt(sharePosition.userCollateral || '0'))
    ).toFixed(2);
    const payoutStr = parseFloat(
      formatEther(BigInt(sharePosition.totalPayout || '0'))
    ).toFixed(2);

    const qp = new URLSearchParams();
    qp.set('wager', wager);
    qp.set('payout', payoutStr);
    qp.set('symbol', collateralSymbol);
    if (!isPredictorToken) {
      qp.set('anti', '1');
    }

    for (const pick of resolvedPicks) {
      qp.append('leg', `${pick.question}|${pick.choice}`);
    }

    return `/og/prediction?${qp.toString()}`;
  }, [sharePosition, conditionsMap, collateralSymbol]);

  // Header with leftSlot (tab switcher) and inline filters
  // When leftSlot is provided (profile page), tabs + filters sit on one row (desktop)
  // and stack on mobile. When no leftSlot (condition page), filters render standalone.
  const headerContent = (
    <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
      {leftSlot}
      {showHeaderText && !leftSlot && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Positions</h3>
          <Badge variant="outline">{filteredPositions.length} positions</Badge>
        </div>
      )}
      <div className="flex-1">
        <PositionsTableFilters filters={filters} onFiltersChange={setFilters} />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {headerContent}
        <TableLoadingState message="Loading positions…" fillViewport />
      </>
    );
  }

  if (error) {
    return (
      <>
        {headerContent}
        <div className="flex items-center justify-center min-h-[calc(100svh-340px)] text-destructive">
          Error loading positions
        </div>
      </>
    );
  }

  if (positions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No positions found" fillViewport />
      </>
    );
  }

  // Filters are applied client-side, so a page with 0 matches doesn't
  // mean there are no matches at all — later pages may have some.
  // Render the sentinel below the empty state when there are more
  // pages so infinite scroll can keep fetching.
  if (filteredPositions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState
          fillViewport
          message={
            hasMore && isFetchingMore
              ? 'Loading more positions…'
              : 'No positions match your filters'
          }
        />
        {hasMore && <div ref={loadMoreRef} className="h-0" />}
      </>
    );
  }

  return (
    <>
      {headerContent}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60">
              <TableHead className="h-auto py-3">
                <SortableHeader
                  label="Position"
                  sortKey="updatedAt"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="h-auto py-3">
                <SortableHeader
                  label="Position Size"
                  sortKey="positionSize"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="h-auto py-3">
                <SortableHeader
                  label="Payout"
                  sortKey="payout"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="h-auto py-3">
                <SortableHeader
                  label="Profit/Loss"
                  sortKey="pnl"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="h-auto py-3">
                <SortableHeader
                  label={
                    <span className="flex items-center gap-1">
                      Ends
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help">
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          End times are estimates and may vary
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  }
                  sortKey="ends"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="h-auto py-3"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPositions.map((position) => (
              <PositionRow
                key={position.id}
                position={position}
                collateralSymbol={collateralSymbol}
                conditionsMap={conditionsMap}
                onShare={setSharePosition}
                onOpenDialog={() => setDialogPosition(position)}
                onRefetch={refetch}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && (
        <InfiniteScrollFooter
          ref={loadMoreRef}
          isLoading={isFetchingMore}
          loadingMessage="Loading more positions…"
        />
      )}
      <PositionDialog
        open={dialogPosition !== null}
        onOpenChange={(open) => {
          if (!open) setDialogPosition(null);
        }}
        position={dialogPosition}
        conditionsMap={conditionsMap}
        collateralSymbol={collateralSymbol}
      />

      {sharePosition && shareImageSrc && (
        <OgShareDialogBase
          imageSrc={shareImageSrc}
          open={!!sharePosition}
          onOpenChange={(open) => {
            if (!open) setSharePosition(null);
          }}
          title="Share Prediction"
          shareUrl={
            sharePosition.pickConfig?.predictionId
              ? typeof window !== 'undefined'
                ? `${window.location.origin}/predictions/${sharePosition.pickConfig.predictionId}`
                : `/predictions/${sharePosition.pickConfig.predictionId}`
              : undefined
          }
        />
      )}
    </>
  );
}
