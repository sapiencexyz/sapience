'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
import * as React from 'react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { OutcomeSide } from '@sapience/sdk/types';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import PicksSummary from '~/components/shared/PicksSummary';
import PicksPopover from '~/components/shared/PicksPopover';
import CountdownCell from '~/components/shared/CountdownCell';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import {
  usePredictionsByConditionId,
  usePositionBalances,
  type Prediction,
  type PickConfigData,
} from '~/hooks/graphql/usePositions';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import {
  useAccountActivity,
  type ActivityItem,
  type PredictionActivity,
  type TradeActivity,
} from '~/hooks/graphql/useAccountActivity';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import PredictionDialog from '~/components/positions/PredictionDialog';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '~/components/positions/toPickLegs';
import {
  ActivityTableFilters,
  getDefaultActivityFilterState,
  type ActivityFilterState,
} from '~/components/positions/ActivityTableFilters';
import {
  isWithinDateRange,
  matchesConditionSearch,
} from '~/lib/utils/tableFilters';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';

// ─── Timestamp formatting ────────────────────────────────────────────────────

function formatTimestamp(ms: number) {
  const date = new Date(ms);
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    exact: date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }),
  };
}

// ─── Type badge ──────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: 'prediction' | 'trade' }) {
  const isPrediction = type === 'prediction';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono uppercase border ${
        isPrediction
          ? 'border-foreground/40 bg-foreground/10 text-foreground'
          : 'border-muted-foreground/40 bg-muted/20 text-muted-foreground'
      }`}
    >
      {isPrediction ? 'Prediction' : 'Trade'}
    </span>
  );
}

// ─── Prediction row ──────────────────────────────────────────────────────────

function PredictionActivityRow({
  item,
  collateralSymbol,
  conditionsMap,
  onShare,
  onOpenDialog,
}: {
  item: PredictionActivity;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  onShare: (data: {
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  }) => void;
  onOpenDialog: () => void;
}) {
  const { prediction, pickConfig, isPredictorSide } = item;
  const rawPicks = pickConfig?.picks ?? [];
  const pickLegs = toPicks(rawPicks, isPredictorSide, conditionsMap);

  const { relative: timeDisplay, exact: exactDisplay } = formatTimestamp(
    item.timestamp
  );

  const predictorEth = Number(
    formatEther(BigInt(prediction.predictorCollateral))
  );
  const counterpartyEth = Number(
    formatEther(BigInt(prediction.counterpartyCollateral))
  );
  const totalEth = predictorEth + counterpartyEth;

  const computed = !prediction.settled
    ? computeResultFromConditions(rawPicks, conditionsMap)
    : null;
  const isSettled = prediction.settled || computed?.result !== 'UNRESOLVED';
  const result = prediction.settled
    ? prediction.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  const counterpartyWon = result === 'COUNTERPARTY_WINS';

  const endsAtSec =
    pickConfig?.endsAt ??
    Math.max(
      0,
      ...rawPicks.map((p) => conditionsMap.get(p.conditionId)?.endTime ?? 0)
    );
  const endsAtMs = endsAtSec * 1000;

  return (
    <tr className="border-b last:border-b-0">
      {/* Date */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Date
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-brand-white whitespace-nowrap cursor-default">
                  {timeDisplay}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>{exactDisplay}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Type
          </div>
          <TypeBadge type="prediction" />
        </div>
      </td>
      {/* Position */}
      <td className="px-4 py-3">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Position
          </div>
          {pickLegs.length > 0 ? (
            <PicksSummary
              picks={pickLegs}
              isCounterparty={!isPredictorSide}
              predictionId={prediction.predictionId}
              onClick={onOpenDialog}
            />
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </div>
      </td>
      {/* Parties */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Parties
          </div>
          <div className="flex flex-col gap-1">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-mono ${predictorWon ? 'text-green-400' : 'text-brand-white'}`}
            >
              <EnsAvatar
                address={prediction.predictor}
                className="shrink-0 rounded-sm ring-1 ring-border/50"
                width={16}
                height={16}
              />
              <AddressDisplay address={prediction.predictor} />
              <span className="text-muted-foreground text-xs">
                <NumberDisplay
                  value={predictorEth}
                  className="tabular-nums text-muted-foreground font-mono"
                />{' '}
                {collateralSymbol}
              </span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-mono ${counterpartyWon ? 'text-green-400' : 'text-brand-white'}`}
            >
              <EnsAvatar
                address={prediction.counterparty}
                className="shrink-0 rounded-sm ring-1 ring-border/50"
                width={16}
                height={16}
              />
              <AddressDisplay address={prediction.counterparty} />
              <span className="text-muted-foreground text-xs">
                <NumberDisplay
                  value={counterpartyEth}
                  className="tabular-nums text-muted-foreground font-mono"
                />{' '}
                {collateralSymbol}
              </span>
            </span>
          </div>
        </div>
      </td>
      {/* Value */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Value
          </div>
          <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
            <NumberDisplay
              value={totalEth}
              className="tabular-nums text-brand-white font-mono"
            />{' '}
            <span className="tabular-nums text-brand-white font-mono">
              {collateralSymbol}
            </span>
          </div>
        </div>
      </td>
      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Status
          </div>
          {!isSettled && endsAtSec > 0 && endsAtMs > Date.now() ? (
            <span className="whitespace-nowrap tabular-nums font-mono text-brand-white">
              ENDS <CountdownCell endTime={endsAtSec} />
            </span>
          ) : !isSettled ? (
            <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
              Pending
            </span>
          ) : predictorWon ? (
            <span className="whitespace-nowrap tabular-nums font-mono uppercase text-green-600 cursor-default">
              Predictor won
            </span>
          ) : counterpartyWon ? (
            <span className="whitespace-nowrap tabular-nums font-mono uppercase text-green-600 cursor-default">
              Counterparty won
            </span>
          ) : (
            <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
              Settled
            </span>
          )}
        </div>
      </td>
      {/* Share */}
      <td className="px-4 py-3 whitespace-nowrap">
        <button
          type="button"
          className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
          onClick={() => onShare({ prediction, pickConfig, isPredictorSide })}
        >
          Share
        </button>
      </td>
    </tr>
  );
}

// ─── Trade row ───────────────────────────────────────────────────────────────

function TradeActivityRow({
  item,
  collateralSymbol,
  conditionsMap,
  hasAccount,
}: {
  item: TradeActivity;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  hasAccount: boolean;
}) {
  const { trade, pickConfig, isBuyer } = item;
  const rawPicks = pickConfig?.picks ?? [];
  // Determine if trade token is the predictor token
  const isPredictorToken =
    pickConfig?.predictorToken?.toLowerCase() === trade.token.toLowerCase();
  const pickLegs = toPicks(rawPicks, isPredictorToken, conditionsMap);

  const { relative: timeDisplay, exact: exactDisplay } = formatTimestamp(
    item.timestamp
  );

  const amount = Number(formatEther(BigInt(trade.tokenAmount)));
  const price = Number(formatEther(BigInt(trade.price)));

  return (
    <tr className="border-b last:border-b-0">
      {/* Date */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Date
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-brand-white whitespace-nowrap cursor-default">
                  {timeDisplay}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>{exactDisplay}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Type
          </div>
          <TypeBadge type="trade" />
        </div>
      </td>
      {/* Position */}
      <td className="px-4 py-3">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Position
          </div>
          <div className="flex items-center gap-1.5">
            <PicksPopover picks={pickLegs} fallbackAddress={trade.token} />
            {!isPredictorToken && <CounterpartyBadge />}
          </div>
        </div>
      </td>
      {/* Parties */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Parties
          </div>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-white">
              <EnsAvatar
                address={trade.buyer}
                className="shrink-0 rounded-sm ring-1 ring-border/50"
                width={16}
                height={16}
              />
              <AddressDisplay address={trade.buyer} />
              <span className="text-muted-foreground text-xs uppercase">
                buyer
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-white">
              <EnsAvatar
                address={trade.seller}
                className="shrink-0 rounded-sm ring-1 ring-border/50"
                width={16}
                height={16}
              />
              <AddressDisplay address={trade.seller} />
              <span className="text-muted-foreground text-xs uppercase">
                seller
              </span>
            </span>
          </div>
        </div>
      </td>
      {/* Value */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Value
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="whitespace-nowrap tabular-nums text-brand-white font-mono">
              <NumberDisplay value={price} /> {collateralSymbol}
            </span>
            <span className="whitespace-nowrap tabular-nums text-muted-foreground font-mono text-xs">
              <NumberDisplay value={amount} /> &times;{' '}
              <NumberDisplay value={amount > 0 ? price / amount : 0} />{' '}
              {collateralSymbol}
            </span>
          </div>
        </div>
      </td>
      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Status
          </div>
          <span
            className={`whitespace-nowrap tabular-nums font-mono uppercase cursor-default ${
              hasAccount
                ? isBuyer
                  ? 'text-green-400'
                  : 'text-amber-400'
                : 'text-brand-white'
            }`}
          >
            {hasAccount ? (isBuyer ? 'Bought' : 'Sold') : 'Trade'}
          </span>
        </div>
      </td>
      {/* Share (empty for trades) */}
      <td className="px-4 py-3 whitespace-nowrap" />
    </tr>
  );
}

// ─── Share dialog ────────────────────────────────────────────────────────────

function SharePredictionDialog({
  sharePrediction,
  conditionsMap,
  collateralSymbol,
  onClose,
}: {
  sharePrediction: {
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  };
  conditionsMap: ConditionsMap;
  collateralSymbol: string;
  onClose: () => void;
}) {
  const { prediction, pickConfig, isPredictorSide } = sharePrediction;

  const imageSrc = React.useMemo(() => {
    const picks = pickConfig?.picks ?? [];
    const predictorEth = Number(
      formatEther(BigInt(prediction.predictorCollateral))
    );
    const counterpartyEth = Number(
      formatEther(BigInt(prediction.counterpartyCollateral))
    );
    const totalEth = predictorEth + counterpartyEth;

    const wager = isPredictorSide ? predictorEth : counterpartyEth;

    const qp = new URLSearchParams();
    qp.set('wager', wager.toFixed(2));
    qp.set('payout', totalEth.toFixed(2));
    qp.set('symbol', collateralSymbol);
    if (!isPredictorSide) {
      qp.set('anti', '1');
    }

    for (const pick of picks) {
      const condition = conditionsMap.get(pick.conditionId);
      const question =
        condition?.question ?? condition?.shortName ?? pick.conditionId;
      const choice = isPredictorSide
        ? (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES
          ? 'Yes'
          : 'No'
        : (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES
          ? 'No'
          : 'Yes';
      qp.append('leg', `${question}|${choice}`);
    }

    return `/og/prediction?${qp.toString()}`;
  }, [
    prediction,
    pickConfig,
    isPredictorSide,
    conditionsMap,
    collateralSymbol,
  ]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/predictions/${prediction.predictionId}`
      : `/predictions/${prediction.predictionId}`;

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Share Prediction"
      shareUrl={shareUrl}
    />
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

export default function ActivityTable({
  account,
  conditionId,
  leftSlot,
  pageSize,
}: {
  account?: Address;
  conditionId?: string;
  leftSlot?: React.ReactNode;
  pageSize?: number;
}) {
  const collateralSymbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] || 'USDe';
  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  const [filters, setFilters] = useState<ActivityFilterState>(
    getDefaultActivityFilterState
  );

  // ── Unified activity (account + recent modes) ───────────────────────────
  const isConditionMode = !account && !!conditionId;
  const {
    items: activityItems,
    isLoading: activityLoading,
    isFetchingMore: activityFetchingMore,
    hasMore: activityHasMore,
    fetchMore: activityFetchMore,
  } = useAccountActivity({
    account,
    pageSize: effectivePageSize,
    activityType: filters.activityType,
    enabled: !isConditionMode,
  });

  // ── Condition-only mode (no account) ─────────────────────────────────────
  const [condTake, setCondTake] = useState(effectivePageSize);

  const { data: conditionPredictions, isLoading: conditionLoading } =
    usePredictionsByConditionId({
      conditionId: !account ? conditionId : undefined,
      take: condTake,
      skip: 0,
    });

  // Positions for non-account enrichment
  const { data: positions } = usePositionBalances({
    holder: account,
  });

  // Decide which mode we're in
  const isAccountMode = !!account;

  const isLoading = isConditionMode ? conditionLoading : activityLoading;

  // For condition mode, build items from predictions only
  const tokenMap = React.useMemo(() => {
    const map = new Map<
      string,
      { pickConfig: PickConfigData; isPredictorToken: boolean }
    >();
    for (const pos of positions) {
      if (pos.pickConfig) {
        map.set(pos.tokenAddress.toLowerCase(), {
          pickConfig: pos.pickConfig,
          isPredictorToken: pos.isPredictorToken,
        });
      }
    }
    return map;
  }, [positions]);

  const conditionItems: ActivityItem[] = React.useMemo(() => {
    return conditionPredictions.map((pred) => {
      const byPredictor = tokenMap.get(pred.predictorToken.toLowerCase());
      const byCounterparty = tokenMap.get(pred.counterpartyToken.toLowerCase());
      const match = byPredictor ?? byCounterparty;
      const timestamp = pred.collateralDepositedAt
        ? pred.collateralDepositedAt * 1000
        : new Date(pred.createdAt).getTime();
      return {
        type: 'prediction' as const,
        timestamp,
        prediction: pred,
        pickConfig: pred.pickConfig ?? match?.pickConfig ?? null,
        isPredictorSide: account
          ? pred.predictor.toLowerCase() === account.toLowerCase()
          : true,
      };
    });
  }, [conditionPredictions, tokenMap, account]);

  const items = isConditionMode ? conditionItems : activityItems;

  // ── Condition enrichment for all prediction items ────────────────────────
  const conditionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      for (const pick of item.pickConfig?.picks ?? []) {
        ids.add(pick.conditionId);
      }
    }
    return Array.from(ids);
  }, [items]);

  const { map: conditionsMap } = useConditionsByIds(conditionIds);

  // ── Client-side filters ──────────────────────────────────────────────────
  const filteredItems = React.useMemo(() => {
    let result = items;

    // Activity type filtering is handled server-side via the hook

    // Filter by search term
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim();
      result = result.filter((item) => {
        if (item.type === 'prediction') {
          const ids = (item.pickConfig?.picks ?? []).map((p) => p.conditionId);
          return matchesConditionSearch(term, ids, conditionsMap);
        }
        // For trades, match via pick config condition IDs
        const tradePickIds = (item.pickConfig?.picks ?? []).map(
          (p) => p.conditionId
        );
        return matchesConditionSearch(term, tradePickIds, conditionsMap);
      });
    }

    // Filter by status (only applies to predictions)
    if (filters.status.length > 0 && filters.status.length < 3) {
      result = result.filter((item) => {
        if (item.type === 'trade') return true; // trades pass through status filter
        const { prediction, pickConfig } = item;
        const picks = pickConfig?.picks ?? [];
        const computed = !prediction.settled
          ? computeResultFromConditions(picks, conditionsMap)
          : null;
        const effectiveResult = prediction.settled
          ? prediction.result
          : (computed?.result ?? 'UNRESOLVED');

        if (effectiveResult === 'UNRESOLVED')
          return filters.status.includes('pending');
        if (effectiveResult === 'PREDICTOR_WINS')
          return filters.status.includes('predictor_won');
        if (effectiveResult === 'COUNTERPARTY_WINS')
          return filters.status.includes('counterparty_won');
        return filters.status.includes('pending');
      });
    }

    // Filter by value range
    if (filters.valueRange[0] > 0 || filters.valueRange[1] < Infinity) {
      result = result.filter((item) => {
        const value =
          item.type === 'prediction'
            ? Number(formatEther(BigInt(item.prediction.predictorCollateral))) +
              Number(
                formatEther(BigInt(item.prediction.counterpartyCollateral))
              )
            : Number(formatEther(BigInt(item.trade.price)));
        return value >= filters.valueRange[0] && value <= filters.valueRange[1];
      });
    }

    // Filter by date range
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      result = result.filter((item) =>
        isWithinDateRange(item.timestamp, filters.dateRange)
      );
    }

    return result;
  }, [items, filters, conditionsMap]);

  // ── Share / detail dialog state ──────────────────────────────────────────
  const [sharePrediction, setSharePrediction] = useState<{
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  } | null>(null);

  const [dialogPrediction, setDialogPrediction] = useState<{
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  } | null>(null);

  // ── Infinite scroll ──────────────────────────────────────────────────────
  const hasMore = isConditionMode
    ? conditionPredictions.length >= condTake
    : activityHasMore;

  const { loadMoreRef } = useInfiniteScroll({
    hasMore,
    isLoading,
    isFetchingMore: isConditionMode ? false : activityFetchingMore,
    onFetchMore: () => {
      if (isConditionMode) {
        setCondTake((t) => t + effectivePageSize);
      } else {
        activityFetchMore();
      }
    },
  });

  // ── Render ───────────────────────────────────────────────────────────────
  const headerContent = (
    <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
      {leftSlot && leftSlot}
      <div className="flex-1">
        <ActivityTableFilters
          filters={filters}
          onFiltersChange={setFilters}
          showTypeFilter={!isConditionMode}
        />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {headerContent}
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground font-mono uppercase">
            Loading activity…
          </span>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No activity found" />
      </>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No activity matches your filters" />
      </>
    );
  }

  return (
    <>
      {headerContent}
      <div className="overflow-x-auto">
        <table className="w-full text-sm [&>tbody>tr>td]:align-middle [&>tbody>tr:hover]:bg-muted/50 [&>tbody>tr>td]:text-brand-white">
          <thead className="hidden xl:table-header-group text-sm font-medium text-muted-foreground">
            <tr className="bg-white/[0.03] border-b border-border/60">
              <th className="px-4 py-3 text-left align-middle font-medium">
                Date
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Type
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Position
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Parties
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Value
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Status
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) =>
              item.type === 'prediction' ? (
                <PredictionActivityRow
                  key={`pred-${item.prediction.id}`}
                  item={item}
                  collateralSymbol={collateralSymbol}
                  conditionsMap={conditionsMap}
                  onShare={(data) => setSharePrediction(data)}
                  onOpenDialog={() =>
                    setDialogPrediction({
                      prediction: item.prediction,
                      pickConfig: item.pickConfig,
                      isPredictorSide: item.isPredictorSide,
                    })
                  }
                />
              ) : (
                <TradeActivityRow
                  key={`trade-${item.trade.tradeHash}`}
                  item={item}
                  collateralSymbol={collateralSymbol}
                  conditionsMap={conditionsMap}
                  hasAccount={isAccountMode}
                />
              )
            )}
          </tbody>
        </table>
      </div>
      <div ref={loadMoreRef} className="h-1" />
      {sharePrediction && (
        <SharePredictionDialog
          sharePrediction={sharePrediction}
          conditionsMap={conditionsMap}
          collateralSymbol={collateralSymbol}
          onClose={() => setSharePrediction(null)}
        />
      )}
      <PredictionDialog
        open={dialogPrediction !== null}
        onOpenChange={(open) => {
          if (!open) setDialogPrediction(null);
        }}
        prediction={dialogPrediction?.prediction ?? null}
        pickConfig={dialogPrediction?.pickConfig ?? null}
        isPredictorSide={dialogPrediction?.isPredictorSide ?? true}
        conditionsMap={conditionsMap}
        collateralSymbol={collateralSymbol}
      />
    </>
  );
}
