'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import NumberDisplay from '~/components/shared/NumberDisplay';
import CountdownCell from '~/components/shared/CountdownCell';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import Loader from '~/components/shared/Loader';

export interface PositionSummaryProps {
  positionId: string | number;
  /** Whether this is a counterparty position (as opposed to predictor position) */
  isCounterpartyPosition?: boolean;
  createdAt: Date | null;
  endsAtMs: number | null;
  positionSize: number;
  payout: number;
  pnl: number | null;
  roi: number | null;
  isSettled: boolean;
  /** Whether this position won */
  positionWon?: boolean;
  collateralSymbol?: string;
  /** Link to the full position page. If provided, shows an external link icon. */
  positionUrl?: string;
  /** Addresses for the addresses row */
  currentOwner?: string | null;
  isOwnerLoading?: boolean;
  predictorAddress?: string | null;
  counterpartyAddress?: string | null;
}

export default function PositionSummary({
  positionId,
  isCounterpartyPosition,
  createdAt,
  endsAtMs,
  positionSize,
  payout,
  pnl,
  roi,
  isSettled,
  positionWon,
  collateralSymbol = 'USDe',
  positionUrl,
  currentOwner,
  isOwnerLoading,
  predictorAddress,
  counterpartyAddress,
}: PositionSummaryProps) {
  const showOwner = isOwnerLoading || !!currentOwner;
  const showAddressesRow = showOwner || predictorAddress || counterpartyAddress;

  return (
    <div className="space-y-4 pt-2">
      {/* Header row */}
      <div className="flex items-center gap-2 pb-2">
        {/* Left group: Position ID, external link, counterparty badge */}
        <div className="flex items-center gap-2">
          <h2 className="eyebrow text-foreground">
            Prediction{' '}
            {typeof positionId === 'string' &&
            positionId.startsWith('0x') &&
            positionId.length > 12
              ? `${positionId.slice(0, 6)}...${positionId.slice(-4)}`
              : `#${positionId}`}
          </h2>
          {positionUrl && (
            <Link
              href={positionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View full prediction page"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
          {isCounterpartyPosition && <CounterpartyBadge />}
        </div>
        {/* Status badge */}
        {isSettled ? (
          positionWon ? (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-yes/40 bg-yes/10 text-yes">
              WON
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-no/40 bg-no/10 text-no">
              LOST
            </span>
          )
        ) : (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-foreground/40 bg-foreground/10 text-foreground">
            ACTIVE
          </span>
        )}
        {/* Created time - pushed right */}
        <div className="flex items-center gap-2 ml-auto">
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

      {/* Addresses row */}
      {showAddressesRow && (
        <div
          className={`grid grid-cols-1 gap-4 ${showOwner ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
        >
          {/* Current Owner - only shown for NFT-based positions */}
          {showOwner && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                Current Owner
              </div>
              {isOwnerLoading ? (
                <div className="flex items-center h-[24px]">
                  <Loader className="w-3.5 h-3.5" />
                </div>
              ) : currentOwner ? (
                <Link
                  href={`/profile/${currentOwner}`}
                  className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
                >
                  <EnsAvatar
                    address={currentOwner}
                    className="shrink-0 rounded-sm ring-1 ring-border/50"
                    width={16}
                    height={16}
                  />
                  <AddressDisplay address={currentOwner} />
                </Link>
              ) : (
                <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                  —
                </span>
              )}
            </div>
          )}

          {/* Predictor */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Predictor
            </div>
            {predictorAddress ? (
              <Link
                href={`/profile/${predictorAddress}`}
                className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
              >
                <EnsAvatar
                  address={predictorAddress}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={predictorAddress} />
              </Link>
            ) : (
              <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                —
              </span>
            )}
          </div>

          {/* Counterparty */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Counterparty
            </div>
            {counterpartyAddress ? (
              <Link
                href={`/profile/${counterpartyAddress}`}
                className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground hover:text-accent-gold transition-colors"
              >
                <EnsAvatar
                  address={counterpartyAddress}
                  className="shrink-0 rounded-sm ring-1 ring-border/50"
                  width={16}
                  height={16}
                />
                <AddressDisplay address={counterpartyAddress} />
              </Link>
            ) : (
              <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                —
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Ends / Created */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
            {endsAtMs && endsAtMs > Date.now() ? 'Ends' : 'Created'}
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            {endsAtMs && endsAtMs > Date.now() ? (
              <CountdownCell endTime={Math.floor(endsAtMs / 1000)} />
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

        {/* Position Size */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
            Position Size
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            <NumberDisplay value={positionSize} className="tabular-nums" />
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {collateralSymbol}
            </span>
          </span>
        </div>

        {/* Payout */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
            Payout
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            <NumberDisplay value={payout} className="tabular-nums" />
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {collateralSymbol}
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
                {collateralSymbol}
              </span>
              {roi !== null && positionSize > 0 && (
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
  );
}
