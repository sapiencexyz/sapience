'use client';

import { formatEther, type Address } from 'viem';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { PicksContent } from '~/components/shared/PicksSummary';
import type { PositionData } from '~/app/og/_position-helpers';
import type { Pick } from '~/components/shared/StackedPredictions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import NumberDisplay from '~/components/shared/NumberDisplay';
import CountdownTimer from './CountdownTimer';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';

function positionToLegs(position: PositionData): Pick[] {
  return (position.predictions ?? []).map((pred) => ({
    question:
      pred.condition?.shortName || pred.condition?.question || pred.conditionId,
    choice: pred.outcomeYes ? 'YES' : 'NO',
    conditionId: pred.conditionId,
    categorySlug: pred.condition?.categorySlug ?? null,
    endTime: pred.condition?.endTime ?? null,
    settled: pred.condition?.settled ?? false,
    resolvedToYes: pred.condition?.resolvedToYes ?? false,
    resolverAddress: pred.condition?.resolver ?? null,
  }));
}

function formatCollateral(wei?: string): number {
  if (!wei) return 0;
  try {
    return Number(formatEther(BigInt(wei)));
  } catch {
    return 0;
  }
}

export default function PositionPageClient({
  nftId,
  marketAddress,
  serverPosition,
}: {
  nftId: string;
  marketAddress: string;
  serverPosition: PositionData | null;
}) {
  // Fetch current NFT owner on-chain (must be called before any early return)
  const { data: currentOwner, isLoading: isOwnerLoading } = useReadContract({
    address: marketAddress as Address,
    abi: predictionMarketAbi,
    functionName: 'ownerOf',
    args: [BigInt(nftId)],
    chainId: serverPosition?.chainId ?? DEFAULT_CHAIN_ID,
  });

  if (!serverPosition) {
    return (
      <div className="text-center text-muted-foreground">
        Position not found.
      </div>
    );
  }

  const isCounterparty = serverPosition.counterpartyNftTokenId === nftId;
  const legs = positionToLegs(serverPosition);

  if (isCounterparty) {
    for (const leg of legs) {
      const upper = String(leg.choice || '').toUpperCase();
      if (upper === 'YES') leg.choice = 'NO';
      else if (upper === 'NO') leg.choice = 'YES';
    }
  }

  const wager = formatCollateral(
    isCounterparty
      ? serverPosition.counterpartyCollateral
      : serverPosition.predictorCollateral
  );
  const toWin = formatCollateral(serverPosition.totalCollateral);
  const createdAt = serverPosition.mintedAt
    ? new Date(serverPosition.mintedAt * 1000)
    : null;
  const endsAtMs = serverPosition.endsAt ? serverPosition.endsAt * 1000 : null;

  // Compute PnL for settled positions (mirrors PositionsTable logic)
  const isSettled =
    serverPosition.status === 'settled' ||
    serverPosition.status === 'consolidated';
  const pnl = (() => {
    if (
      !isSettled ||
      serverPosition.predictorWon === null ||
      serverPosition.predictorWon === undefined
    )
      return null;
    const viewerWon = isCounterparty
      ? !serverPosition.predictorWon
      : serverPosition.predictorWon;
    const total = formatCollateral(serverPosition.totalCollateral);
    if (viewerWon) return total - wager;
    return -wager;
  })();
  const roi = pnl !== null && wager > 0 ? (pnl / wager) * 100 : null;

  return (
    <>
      {/* Position summary header */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="eyebrow text-foreground">Position #{nftId}</h2>
            {isCounterparty && <CounterpartyBadge />}
          </div>
          <div className="flex items-center gap-2">
            {isSettled &&
              serverPosition.predictorWon !== null &&
              serverPosition.predictorWon !== undefined &&
              (() => {
                const viewerWon = isCounterparty
                  ? !serverPosition.predictorWon
                  : serverPosition.predictorWon;
                return viewerWon ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 uppercase">
                    Won
                  </span>
                ) : null;
              })()}
            {createdAt && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="whitespace-nowrap text-muted-foreground text-xs cursor-default">
                      created{' '}
                      {formatDistanceToNow(createdAt, { addSuffix: false })} ago
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      {createdAt.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short',
                      })}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Row 1: Addresses */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Current Owner */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Current Owner
            </div>
            {currentOwner ? (
              <Link
                href={`/profile/${currentOwner}`}
                className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
              >
                <EnsAvatar
                  address={currentOwner as string}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={currentOwner as string} />
              </Link>
            ) : (
              <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                —
              </span>
            )}
          </div>

          {/* Predictor */}
          {serverPosition.predictor && (
            <div className="space-y-1">
              <div
                className={`text-[11px] uppercase tracking-wider font-normal font-mono ${!isCounterparty ? 'text-accent-gold' : 'text-muted-foreground'}`}
              >
                Predictor
              </div>
              <Link
                href={`/profile/${serverPosition.predictor}`}
                className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
              >
                <EnsAvatar
                  address={serverPosition.predictor}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={serverPosition.predictor} />
              </Link>
            </div>
          )}

          {/* Counterparty */}
          {serverPosition.counterparty && (
            <div className="space-y-1">
              <div
                className={`text-[11px] uppercase tracking-wider font-normal font-mono ${isCounterparty ? 'text-accent-gold' : 'text-muted-foreground'}`}
              >
                Counterparty
              </div>
              <Link
                href={`/profile/${serverPosition.counterparty}`}
                className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
              >
                <EnsAvatar
                  address={serverPosition.counterparty}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={serverPosition.counterparty} />
              </Link>
            </div>
          )}
        </div>

        {/* Row 2: Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Ends / Created */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              {endsAtMs && endsAtMs > Date.now() ? 'Ends' : 'Created'}
            </div>
            <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
              {endsAtMs && endsAtMs > Date.now() ? (
                <CountdownTimer endsAtMs={endsAtMs} />
              ) : createdAt ? (
                <span title={createdAt.toLocaleString()}>
                  {createdAt.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>

          {/* Wager */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Wager
            </div>
            <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
              <NumberDisplay value={wager} className="tabular-nums" />
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                USDe
              </span>
            </span>
          </div>

          {/* To Win */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              To Win
            </div>
            <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
              <NumberDisplay value={toWin} className="tabular-nums" />
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                USDe
              </span>
            </span>
          </div>

          {/* Profit/Loss */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Profit/Loss
            </div>
            {pnl !== null ? (
              <span
                className={`text-sm md:text-base font-medium tabular-nums items-baseline ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                <NumberDisplay value={pnl} className="tabular-nums" />
                <span
                  className={`ml-1 text-xs font-normal ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  USDe
                </span>
                {roi !== null && wager > 0 && (
                  <span
                    className={`ml-1 text-[10px] tabular-nums font-mono ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {roi >= 0 ? '+' : ''}
                    {Math.round(roi).toLocaleString()}%
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                —
              </span>
            )}
          </div>
        </div>
      </div>

      <PicksContent
        legs={legs}
        positionId={nftId}
        isCounterparty={isCounterparty}
        hideHeader
        positionStatus={
          isSettled
            ? (
                isCounterparty
                  ? !serverPosition.predictorWon
                  : serverPosition.predictorWon
              )
              ? isOwnerLoading
                ? 'won'
                : currentOwner
                  ? 'won'
                  : 'claimed'
              : 'lost'
            : serverPosition.endsAt &&
                serverPosition.endsAt * 1000 <= Date.now()
              ? 'pending'
              : 'active'
        }
      />
    </>
  );
}
