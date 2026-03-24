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
import { Info } from 'lucide-react';
import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { PredictionChoiceBadge } from '@sapience/ui';
import { useAccount } from 'wagmi';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';

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
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { StackedIcons } from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import LegacyBadge from '~/components/shared/LegacyBadge';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
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
import { useFeatureFlag } from '~/hooks/useFeatureFlag';

function PositionRow({
  position,
  collateralSymbol,
  conditionsMap,
  onShare,
  onRefetch,
  showSell,
}: {
  position: PositionBalance;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  onShare: (position: PositionBalance) => void;
  onRefetch?: () => void;
  showSell: boolean;
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

  // PnL: profit if won (payout - positionSize), loss if lost (-positionSize)
  const pnlValue = isResolved
    ? holderWon
      ? payoutFormatted - positionSizeFormatted
      : -positionSizeFormatted
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
              {roi >= 0 ? '+' : ''}
              {Math.round(roi).toLocaleString()}%
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
              +{Math.round(roi).toLocaleString()}%
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

    // Not resolved → PENDING
    return (
      <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
        PENDING
      </span>
    );
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <StackedIcons picks={picks} />
          {picks.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {picks.length} {picks.length === 1 ? 'PICK' : 'PICKS'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                align="start"
              >
                <div className="flex flex-col divide-y divide-brand-white/20">
                  {picks.map((pick, i) => {
                    const CategoryIcon = getCategoryIcon(pick.categorySlug);
                    const color = getCategoryStyle(pick.categorySlug).color;
                    return (
                      <div
                        key={`pick-${i}`}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <div
                          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: color }}
                        >
                          <CategoryIcon className="h-3 w-3 text-white/80" />
                        </div>
                        {pick.conditionId ? (
                          <ConditionTitleLink
                            conditionId={pick.conditionId}
                            resolverAddress={pick.resolverAddress ?? undefined}
                            title={pick.question}
                            clampLines={1}
                            className="text-sm flex-1 min-w-0"
                          />
                        ) : (
                          <span className="text-sm flex-1 min-w-0 font-mono truncate">
                            {pick.question}
                          </span>
                        )}
                        <PredictionChoiceBadge
                          choice={String(pick.choice).toUpperCase()}
                        />
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="text-lg font-mono font-semibold text-brand-white whitespace-nowrap">
              —
            </span>
          )}
          {!isPredictorToken && <CounterpartyBadge />}
          {pickConfig?.isLegacy && <LegacyBadge />}
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
          {showSell &&
            !isResolved &&
            isOwnPosition &&
            BigInt(position.balance) > 0n && (
              <SellPositionDialog
                position={position}
                onSuccess={onRefetch}
              >
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm font-medium bg-background hover:bg-accent hover:text-accent-foreground border-border transition-colors"
                >
                  Sell
                </button>
              </SellPositionDialog>
            )}
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
  const showSell = useFeatureFlag('secondaryMarket', 'secondaryMarket');
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
    error: conditionError,
    refetch: conditionRefetch,
  } = usePositionBalancesByConditionId({
    conditionId: !account ? conditionId : undefined,
    settled: serverSettled,
  });

  const positions = account ? accountPositions : conditionPositions;
  const isLoading = account ? accountLoading : conditionLoading;
  const error = account ? accountError : conditionError;
  const refetch = account ? accountRefetch : conditionRefetch;

  // Collect all unique conditionIds to fetch category data
  const conditionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const p of positions) {
      for (const pick of p.pickConfig?.picks ?? []) {
        ids.add(pick.conditionId);
      }
    }
    return Array.from(ids);
  }, [positions]);

  const { map: conditionsMap } = useConditionsByIds(conditionIds);

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

  // Share dialog state
  const [sharePosition, setSharePosition] =
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
        <div className="flex items-center justify-center py-8">
          <Loader />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {headerContent}
        <div className="text-destructive text-center py-8">
          Error loading positions
        </div>
      </>
    );
  }

  if (positions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No positions found" />
      </>
    );
  }

  if (filteredPositions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No positions match your filters" />
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
              <TableHead className="h-auto py-3">Position</TableHead>
              <TableHead className="h-auto py-3">Position Size</TableHead>
              <TableHead className="h-auto py-3">Payout</TableHead>
              <TableHead className="h-auto py-3">Profit/Loss</TableHead>
              <TableHead className="h-auto py-3">
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
              </TableHead>
              <TableHead className="h-auto py-3"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPositions.map((position) => (
              <PositionRow
                key={position.id}
                position={position}
                collateralSymbol={collateralSymbol}
                conditionsMap={conditionsMap}
                onShare={setSharePosition}
                onRefetch={refetch}
                showSell={showSell}
              />
            ))}
          </TableBody>
        </Table>
      </div>
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
