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
import * as React from 'react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';

import CountdownCell from '~/components/shared/CountdownCell';
import { formatDistanceToNow } from 'date-fns';
import type { Pick as PickLeg } from '~/components/shared/StackedPredictions';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  usePositionBalances,
  type PositionBalance,
  type PickData,
} from '~/hooks/graphql/usePositions';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { StackedIcons } from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { PredictionChoiceBadge } from '@sapience/ui';
import OgShareDialogBase from '~/components/shared/OgShareDialog';

type ConditionsMap = Map<string, { question?: string | null; shortName?: string | null; endTime?: number | null; category?: { slug?: string | null } | null }>;

/** Map escrow PickData to the Pick interface used by PicksSummary */
function toPickLegs(
  picks: PickData[],
  isPredictorToken: boolean,
  conditionsMap: ConditionsMap,
): PickLeg[] {
  return picks.map((pick) => ({
    question: conditionsMap.get(pick.conditionId)?.question ?? conditionsMap.get(pick.conditionId)?.shortName ?? pick.conditionId,
    choice: isPredictorToken
      ? pick.predictedOutcome === 1
        ? 'Yes'
        : 'No'
      : pick.predictedOutcome === 1
        ? 'No'
        : 'Yes',
    conditionId: pick.conditionId,
    resolverAddress: pick.conditionResolver,
    categorySlug: conditionsMap.get(pick.conditionId)?.category?.slug ?? null,
  }));
}

function PositionRow({
  position,
  collateralSymbol,
  conditionsMap,
  onShare,
}: {
  position: PositionBalance;
  collateralSymbol: string;
  conditionsMap: ConditionsMap;
  onShare: (position: PositionBalance) => void;
}) {
  const { pickConfig, isPredictorToken } = position;
  const picks = pickConfig?.picks ?? [];
  const legs = toPickLegs(picks, isPredictorToken, conditionsMap);

  const balance = BigInt(position.balance);
  const balanceFormatted = parseFloat(formatEther(balance));

  // Payout if the user's side wins: (balance / sideCollateral) * totalPool
  const totalPool = pickConfig
    ? BigInt(pickConfig.totalPredictorCollateral) +
      BigInt(pickConfig.totalCounterpartyCollateral)
    : 0n;
  const sideCollateral = pickConfig
    ? BigInt(
        isPredictorToken
          ? pickConfig.totalPredictorCollateral
          : pickConfig.totalCounterpartyCollateral
      )
    : 0n;
  const payout =
    sideCollateral > 0n
      ? (balance * totalPool) / sideCollateral
      : 0n;
  const payoutFormatted = parseFloat(formatEther(payout));

  const result = pickConfig?.result ?? 'UNRESOLVED';
  const isResolved = pickConfig?.resolved ?? false;

  const viewerWon =
    isResolved &&
    ((isPredictorToken && result === 'PREDICTOR_WINS') ||
      (!isPredictorToken && result === 'COUNTERPARTY_WINS') ||
      result === 'NON_DECISIVE');

  // PnL: profit if won (totalPool - positionSize), loss if lost (-positionSize)
  const pnlValue = isResolved
    ? viewerWon
      ? payoutFormatted - balanceFormatted
      : -balanceFormatted
    : null;
  const roi =
    pnlValue !== null && balanceFormatted > 0
      ? (pnlValue / balanceFormatted) * 100
      : 0;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <StackedIcons legs={legs} />
          {legs.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {legs.length} {legs.length === 1 ? 'PICK' : 'PICKS'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                align="start"
              >
                <div className="flex flex-col divide-y divide-brand-white/20">
                  {legs.map((leg, i) => {
                    const CategoryIcon = getCategoryIcon(leg.categorySlug);
                    const color = getCategoryStyle(leg.categorySlug).color;
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
                        <span className="text-sm flex-1 min-w-0 font-mono truncate">
                          {leg.question}
                        </span>
                        <PredictionChoiceBadge choice={String(leg.choice).toUpperCase()} />
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
        </div>
      </TableCell>
      <TableCell>
        <NumberDisplay value={balanceFormatted} appendedText={collateralSymbol} className="text-brand-white font-mono" />
      </TableCell>
      <TableCell>
        <NumberDisplay
          value={payoutFormatted}
          appendedText={collateralSymbol}
          className="text-brand-white font-mono"
        />
      </TableCell>
      {/* Profit/Loss */}
      <TableCell>
        {pnlValue !== null ? (
          <div
            className={`whitespace-nowrap tabular-nums font-mono flex items-baseline gap-1.5 ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            <NumberDisplay
              value={pnlValue}
              className={`tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
            />{' '}
            <span
              className={`tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {collateralSymbol}
            </span>
            {balanceFormatted > 0 && (
              <span
                className={`text-[10px] leading-tight tabular-nums font-mono ${pnlValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {roi >= 0 ? '+' : ''}
                {Math.round(roi).toLocaleString()}%
              </span>
            )}
          </div>
        ) : (
          <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
            PENDING
          </span>
        )}
      </TableCell>
      {/* Ends */}
      <TableCell className="whitespace-nowrap">
        {(() => {
          const endsAt = Math.max(
            0,
            ...picks.map((p) => conditionsMap.get(p.conditionId)?.endTime ?? 0),
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
      {/* Share */}
      <TableCell className="text-right">
        <button
          type="button"
          className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
          onClick={() => onShare(position)}
        >
          Share
        </button>
      </TableCell>
    </TableRow>
  );
}

export default function PositionsTable({
  account,
  showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId || DEFAULT_CHAIN_ID] || 'USDe';

  // Fetch position balances for this user
  const {
    data: allPositions,
    isLoading,
    error,
  } = usePositionBalances({
    holder: account,
    chainId,
  });

  // Filter out zero-balance positions (fully redeemed)
  const positions = allPositions.filter((p) => BigInt(p.balance) > 0n);

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

  // Share dialog state
  const [sharePosition, setSharePosition] = React.useState<PositionBalance | null>(null);

  // Build OG image URL for position sharing with balance overrides
  const shareImageSrc = React.useMemo(() => {
    if (!sharePosition) return null;
    const { pickConfig, isPredictorToken } = sharePosition;
    const picks = pickConfig?.picks ?? [];

    const balance = BigInt(sharePosition.balance);
    const totalPool = pickConfig
      ? BigInt(pickConfig.totalPredictorCollateral) +
        BigInt(pickConfig.totalCounterpartyCollateral)
      : 0n;
    const sideCollateral = pickConfig
      ? BigInt(
          isPredictorToken
            ? pickConfig.totalPredictorCollateral
            : pickConfig.totalCounterpartyCollateral
        )
      : 0n;
    const payout =
      sideCollateral > 0n ? (balance * totalPool) / sideCollateral : 0n;

    const wager = parseFloat(formatEther(balance)).toFixed(2);
    const payoutStr = parseFloat(formatEther(payout)).toFixed(2);

    const qp = new URLSearchParams();
    qp.set('wager', wager);
    qp.set('payout', payoutStr);
    qp.set('symbol', collateralSymbol);
    if (!isPredictorToken) {
      qp.set('anti', '1');
    }

    for (const pick of picks) {
      const condition = conditionsMap.get(pick.conditionId);
      const question = condition?.question ?? condition?.shortName ?? pick.conditionId;
      const choice = isPredictorToken
        ? pick.predictedOutcome === 1 ? 'Yes' : 'No'
        : pick.predictedOutcome === 1 ? 'No' : 'Yes';
      qp.append('leg', `${question}|${choice}`);
    }

    return `/og/prediction?${qp.toString()}`;
  }, [sharePosition, conditionsMap, collateralSymbol]);

  // Header with leftSlot (tab switcher) and optional title
  const headerContent = (
    <div className="px-4 py-4 border-b border-border flex items-center gap-4">
      {leftSlot}
      <div className="flex-1">
        {showHeaderText && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Positions</h3>
            <Badge variant="outline">{positions.length} positions</Badge>
          </div>
        )}
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

  return (
    <>
      {headerContent}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60">
              <TableHead>Position</TableHead>
              <TableHead>Position Size</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Profit/Loss</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <PositionRow
                key={position.id}
                position={position}
                collateralSymbol={collateralSymbol}
                conditionsMap={conditionsMap}
                onShare={setSharePosition}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {sharePosition && shareImageSrc && (
        <OgShareDialogBase
          imageSrc={shareImageSrc}
          open={!!sharePosition}
          onOpenChange={(open) => { if (!open) setSharePosition(null); }}
          title="Share Position"
          shareUrl={sharePosition.pickConfig?.predictionId
            ? (typeof window !== 'undefined'
              ? `${window.location.origin}/predictions/${sharePosition.pickConfig.predictionId}`
              : `/predictions/${sharePosition.pickConfig.predictionId}`)
            : undefined}
        />
      )}
    </>
  );
}
