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
import Loader from '~/components/shared/Loader';
import PicksSummary from '~/components/shared/PicksSummary';
import CountdownCell from '~/components/shared/CountdownCell';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import {
  usePredictions,
  usePredictionsByConditionId,
  useRecentPredictions,
  usePositionBalances,
  type Prediction,
  type PickConfigData,
} from '~/hooks/graphql/usePositions';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
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

function ActivityRow({
  prediction,
  pickConfig,
  isPredictorSide,
  collateralSymbol,
  conditionsMap,
  onShare,
  onOpenDialog,
}: {
  prediction: Prediction;
  pickConfig: PickConfigData | null;
  isPredictorSide: boolean;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  onShare: (data: {
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  }) => void;
  onOpenDialog: () => void;
}) {
  const rawPicks = pickConfig?.picks ?? [];
  const pickLegs = toPicks(rawPicks, isPredictorSide, conditionsMap);

  // Timestamp
  const timestamp = prediction.collateralDepositedAt
    ? new Date(prediction.collateralDepositedAt * 1000)
    : new Date(prediction.createdAt);
  const timeDisplay = formatDistanceToNow(timestamp, { addSuffix: true });
  const exactDisplay = timestamp.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  // Collateral amounts
  const predictorEth = Number(
    formatEther(BigInt(prediction.predictorCollateral))
  );
  const counterpartyEth = Number(
    formatEther(BigInt(prediction.counterpartyCollateral))
  );
  const totalEth = predictorEth + counterpartyEth;

  // Result: use on-chain result if settled, otherwise compute from individual conditions
  const computed = !prediction.settled
    ? computeResultFromConditions(rawPicks, conditionsMap)
    : null;
  const isSettled = prediction.settled || computed?.result !== 'UNRESOLVED';
  const result = prediction.settled
    ? prediction.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  const counterpartyWon = result === 'COUNTERPARTY_WINS';

  // Ends: max endTime from condition data
  const endsAtSec =
    pickConfig?.endsAt ??
    Math.max(
      0,
      ...rawPicks.map((p) => conditionsMap.get(p.conditionId)?.endTime ?? 0)
    );
  const endsAtMs = endsAtSec * 1000;

  return (
    <tr className="border-b last:border-b-0">
      {/* Created */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Created
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
      {/* Predictions */}
      <td className="px-4 py-3">
        <div className="text-sm">
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Predictions
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
      {/* Predictor */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Predictor
          </div>
          <div className="flex flex-col gap-0.5">
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
            </span>
            <span className="whitespace-nowrap tabular-nums text-muted-foreground font-mono text-xs">
              <NumberDisplay
                value={predictorEth}
                className="tabular-nums text-muted-foreground font-mono"
              />{' '}
              {collateralSymbol}
            </span>
          </div>
        </div>
      </td>
      {/* Counterparty */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Counterparty
          </div>
          <div className="flex flex-col gap-0.5">
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
            </span>
            <span className="whitespace-nowrap tabular-nums text-muted-foreground font-mono text-xs">
              <NumberDisplay
                value={counterpartyEth}
                className="tabular-nums text-muted-foreground font-mono"
              />{' '}
              {collateralSymbol}
            </span>
          </div>
        </div>
      </td>
      {/* Payout */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Payout
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
      {/* Result */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          <div className="xl:hidden text-xs text-muted-foreground mb-1">
            Result
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

/** Builds OG image URL from query params and renders the share dialog */
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
  const [take, setTake] = useState(effectivePageSize);
  const [filters, setFilters] = useState<ActivityFilterState>(
    getDefaultActivityFilterState
  );

  // Predictions: address-filtered when account provided, conditionId-filtered,
  // or all recent otherwise
  const { data: accountPredictions, isLoading: accountLoading } =
    usePredictions({ address: account, take, skip: 0 });

  const { data: conditionPredictions, isLoading: conditionLoading } =
    usePredictionsByConditionId({
      conditionId: !account ? conditionId : undefined,
      take,
      skip: 0,
    });

  const { data: recentPredictions, isLoading: recentLoading } =
    useRecentPredictions({
      take: take + 1,
      skip: 0,
      enabled: !account && !conditionId,
    });

  const predictions = account
    ? accountPredictions
    : conditionId
      ? conditionPredictions
      : recentPredictions;
  const predictionsLoading = account
    ? accountLoading
    : conditionId
      ? conditionLoading
      : recentLoading;

  // Positions (for pickConfig enrichment): only meaningful with an account
  // usePositionBalances is internally disabled when holder is falsy
  const { data: positions, isLoading: positionsLoading } = usePositionBalances({
    holder: account,
  });

  const isLoading = predictionsLoading || (account ? positionsLoading : false);

  // Build a map of tokenAddress → { pickConfig, isPredictorToken }
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

  // Enrich predictions with pickConfig data
  // Prefer pickConfig from the prediction query, fall back to tokenMap lookup
  const enrichedPredictions = React.useMemo(() => {
    const display =
      !account && predictions.length > take
        ? predictions.slice(0, take)
        : predictions;
    return display.map((pred) => {
      const byPredictor = tokenMap.get(pred.predictorToken.toLowerCase());
      const byCounterparty = tokenMap.get(pred.counterpartyToken.toLowerCase());
      const match = byPredictor ?? byCounterparty;
      return {
        prediction: pred,
        pickConfig: pred.pickConfig ?? match?.pickConfig ?? null,
        isPredictorSide: account
          ? pred.predictor.toLowerCase() === account.toLowerCase()
          : true,
      };
    });
  }, [predictions, tokenMap, account, take]);

  // Collect all conditionIds from pickConfigs
  const conditionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const { pickConfig } of enrichedPredictions) {
      for (const pick of pickConfig?.picks ?? []) {
        ids.add(pick.conditionId);
      }
    }
    return Array.from(ids);
  }, [enrichedPredictions]);

  const { map: conditionsMap } = useConditionsByIds(conditionIds);

  // Apply client-side filters
  const filteredPredictions = React.useMemo(() => {
    let result = enrichedPredictions;

    // Filter by search term (match against condition question text)
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim();
      result = result.filter(({ pickConfig }) => {
        const ids = (pickConfig?.picks ?? []).map((p) => p.conditionId);
        return matchesConditionSearch(term, ids, conditionsMap);
      });
    }

    // Filter by status (using per-condition resolution for early results)
    if (filters.status.length > 0 && filters.status.length < 3) {
      result = result.filter(({ prediction, pickConfig }) => {
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

    // Filter by payout range
    if (filters.valueRange[0] > 0 || filters.valueRange[1] < Infinity) {
      result = result.filter(({ prediction }) => {
        const totalEth =
          Number(formatEther(BigInt(prediction.predictorCollateral))) +
          Number(formatEther(BigInt(prediction.counterpartyCollateral)));
        return (
          totalEth >= filters.valueRange[0] && totalEth <= filters.valueRange[1]
        );
      });
    }

    // Filter by date range
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      result = result.filter(({ prediction }) => {
        const timestampMs = prediction.collateralDepositedAt
          ? prediction.collateralDepositedAt * 1000
          : new Date(prediction.createdAt).getTime();
        return isWithinDateRange(timestampMs, filters.dateRange);
      });
    }

    return result;
  }, [enrichedPredictions, filters, conditionsMap]);

  // Share dialog state
  const [sharePrediction, setSharePrediction] = useState<{
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  } | null>(null);

  // Prediction detail dialog state
  const [dialogPrediction, setDialogPrediction] = useState<{
    prediction: Prediction;
    pickConfig: PickConfigData | null;
    isPredictorSide: boolean;
  } | null>(null);

  const hasMore = predictions.length > take;

  const { loadMoreRef } = useInfiniteScroll({
    hasMore,
    isLoading: predictionsLoading,
    onFetchMore: () => setTake((t) => t + effectivePageSize),
  });

  const headerContent = (
    <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
      {leftSlot && leftSlot}
      <div className="flex-1">
        <ActivityTableFilters filters={filters} onFiltersChange={setFilters} />
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

  if (predictions.length === 0) {
    return (
      <>
        {headerContent}
        <EmptyTabState message="No activity found" />
      </>
    );
  }

  if (filteredPredictions.length === 0) {
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
                Created
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Predictions
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Predictor
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Counterparty
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Payout
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Result
              </th>
              <th className="px-4 py-3 text-left align-middle font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPredictions.map(
              ({ prediction, pickConfig, isPredictorSide }) => (
                <ActivityRow
                  key={prediction.id}
                  prediction={prediction}
                  pickConfig={pickConfig}
                  isPredictorSide={isPredictorSide}
                  collateralSymbol={collateralSymbol}
                  conditionsMap={conditionsMap}
                  onShare={(data) => setSharePrediction(data)}
                  onOpenDialog={() =>
                    setDialogPrediction({
                      prediction,
                      pickConfig,
                      isPredictorSide,
                    })
                  }
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
