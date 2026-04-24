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
import NumberDisplay from '~/components/shared/NumberDisplay';
import CountdownCell from '~/components/shared/CountdownCell';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import Loader from '~/components/shared/Loader';

export interface PositionSummaryProps {
  positionId: string | number;
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
  /**
   * Wallet that holds this aggregated position. Rendered as a "Holder" cell
   * alongside predictor/counterparty in the addresses row.
   */
  holderAddress?: string | null;
  /**
   * Entity kind the summary represents. Controls the header label: a single
   * on-chain prediction renders "Prediction <0xhash>", while an aggregated
   * holder position across multiple predictions renders "Position".
   */
  kind?: 'prediction' | 'position';
  /**
   * Number of picks backing this aggregate position. When provided with
   * kind="position", renders a "Picks" cell in the addresses row.
   */
  pickCount?: number;
  /**
   * When both stakes are provided, the summary switches to a side-agnostic
   * 3-row layout (Predictor / Counterparty / Ends+Payout) and suppresses
   * viewer-specific fields like P/L. Omit for the legacy aggregate layout.
   */
  predictorStake?: number;
  counterpartyStake?: number;
  /** Whether the predictor side won (for winner highlight in symmetric layout). */
  predictorWon?: boolean;
  /** Whether the counterparty side won (for winner highlight in symmetric layout). */
  counterpartyWon?: boolean;
  /**
   * Which side the holder is on. When provided with kind="position", renders a
   * "Side" cell (PREDICTOR / COUNTERPARTY) next to the Holder cell.
   */
  isPredictorSide?: boolean;
}

export default function PositionSummary({
  positionId,
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
  holderAddress,
  kind = 'prediction',
  pickCount,
  predictorStake,
  counterpartyStake,
  predictorWon,
  counterpartyWon,
  isPredictorSide,
}: PositionSummaryProps) {
  const useSymmetricStats =
    predictorStake !== undefined && counterpartyStake !== undefined;
  const showOwner = isOwnerLoading || !!currentOwner;
  const showHolder = !!holderAddress;
  const showSide = kind === 'position' && isPredictorSide !== undefined;
  const showPicks = kind === 'position' && typeof pickCount === 'number';
  const showPositionStatus = kind === 'position' && !useSymmetricStats;
  const showAddressesRow =
    !useSymmetricStats &&
    (showOwner ||
      showHolder ||
      showSide ||
      showPositionStatus ||
      predictorAddress ||
      counterpartyAddress);
  const addressCellCount =
    (showOwner ? 1 : 0) +
    (showHolder ? 1 : 0) +
    (showSide ? 1 : 0) +
    (showPicks ? 1 : 0) +
    (showPositionStatus ? 1 : 0) +
    (kind === 'position' ? 0 : 2);
  const addressGridCols =
    addressCellCount >= 4
      ? 'sm:grid-cols-4'
      : addressCellCount === 3
        ? 'sm:grid-cols-3'
        : addressCellCount === 2
          ? 'sm:grid-cols-2'
          : 'sm:grid-cols-1';

  const renderEndsCell = () => (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        {endsAtMs && endsAtMs > Date.now()
          ? 'Ends'
          : kind === 'position'
            ? 'Ended'
            : 'Created'}
      </div>
      <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
        {endsAtMs && endsAtMs > Date.now() ? (
          <CountdownCell endTime={Math.floor(endsAtMs / 1000)} />
        ) : kind === 'position' ? (
          endsAtMs ? (
            <span title={new Date(endsAtMs).toLocaleString()}>
              {new Date(endsAtMs).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          ) : (
            '—'
          )
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
  );

  const renderCreatedCell = () => (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        Created
      </div>
      <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
        {createdAt ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default whitespace-nowrap">
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
        ) : (
          '—'
        )}
      </span>
    </div>
  );

  const renderStatusCell = () => {
    let value: string;
    let valueClass: string;
    if (isSettled && predictorWon) {
      value = 'PREDICTOR';
      valueClass = 'text-brand-white';
    } else if (isSettled && counterpartyWon) {
      value = 'COUNTERPARTY';
      valueClass = 'text-brand-white';
    } else {
      value = 'PENDING';
      valueClass = 'text-muted-foreground';
    }
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
          Winner
        </div>
        <span
          className={`text-sm md:text-base font-medium font-mono ${valueClass}`}
        >
          {value}
        </span>
      </div>
    );
  };

  const renderPayoutCell = () => (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        Payout
      </div>
      <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
        <NumberDisplay
          value={(predictorStake ?? 0) + (counterpartyStake ?? 0)}
          className="tabular-nums"
        />
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {collateralSymbol}
        </span>
      </span>
    </div>
  );

  const renderPartyCell = (
    label: 'Predictor' | 'Counterparty',
    address: string | null | undefined
  ) => (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        {label}
      </div>
      {address ? (
        <div className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground min-w-0 max-w-full overflow-hidden">
          <Link
            href={`/profile/${address}`}
            aria-label={`View profile for ${address}`}
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <EnsAvatar
              address={address}
              className="shrink-0 rounded-sm ring-1 ring-border/50"
              width={16}
              height={16}
            />
          </Link>
          <AddressDisplay address={address} />
        </div>
      ) : (
        <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
          —
        </span>
      )}
    </div>
  );

  const renderStakeCell = (stake: number, sideWon: boolean | undefined) => (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        Position Size
      </div>
      <span
        className={`text-sm md:text-base font-medium tabular-nums ${
          isSettled && sideWon ? 'text-green-600' : 'text-foreground'
        }`}
      >
        <NumberDisplay value={stake} className="tabular-nums" />
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {collateralSymbol}
        </span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4 pt-2">
      {/* Header row */}
      <div className="flex items-center gap-2 pb-2">
        {/* Left group: Position ID, external link */}
        <div className="flex items-center gap-2">
          <h2 className="eyebrow text-foreground">
            {(() => {
              if (kind === 'position') {
                return 'Position';
              }
              const idStr = String(positionId);
              if (idStr.startsWith('0x')) {
                const truncated =
                  idStr.length > 12
                    ? `${idStr.slice(0, 6)}...${idStr.slice(-4)}`
                    : idStr;
                return (
                  <>
                    Prediction <span className="font-mono">{truncated}</span>
                  </>
                );
              }
              return `Prediction #${idStr}`;
            })()}
          </h2>
        </div>
        {/* Status badge (legacy prediction mode only — symmetric mode and
            position kind both surface it in the grid below) */}
        {!useSymmetricStats &&
          kind !== 'position' &&
          (isSettled ? (
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
          ))}
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
        {/* Created time - pushed right. Symmetric mode renders this inside
            the grid; legacy mode keeps it in the header. Omitted for
            aggregate positions since a holder's token balance has no single
            creation event. */}
        <div className="flex items-center gap-2 ml-auto">
          {!useSymmetricStats && kind !== 'position' && createdAt && (
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

      {useSymmetricStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-6">
          {/* Row 1: parties with stakes */}
          {renderPartyCell('Predictor', predictorAddress)}
          {renderStakeCell(predictorStake, predictorWon)}
          {renderPartyCell('Counterparty', counterpartyAddress)}
          {renderStakeCell(counterpartyStake, counterpartyWon)}

          {/* Row 2: lifecycle */}
          {renderCreatedCell()}
          {renderEndsCell()}
          {renderStatusCell()}
          {renderPayoutCell()}
        </div>
      ) : (
        <>
          {/* Addresses row */}
          {showAddressesRow && (
            <div
              className={`grid ${addressCellCount > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 ${addressGridCols}`}
            >
              {showHolder && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                    Holder
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground">
                    <Link
                      href={`/profile/${holderAddress}`}
                      aria-label={`View profile for ${holderAddress}`}
                      className="shrink-0 hover:opacity-80 transition-opacity"
                    >
                      <EnsAvatar
                        address={holderAddress}
                        className="shrink-0 rounded-sm ring-1 ring-border/50"
                        width={16}
                        height={16}
                      />
                    </Link>
                    <AddressDisplay address={holderAddress} />
                  </div>
                </div>
              )}

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
                    <div className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium tabular-nums text-foreground">
                      <Link
                        href={`/profile/${currentOwner}`}
                        aria-label={`View profile for ${currentOwner}`}
                        className="shrink-0 hover:opacity-80 transition-opacity"
                      >
                        <EnsAvatar
                          address={currentOwner}
                          className="shrink-0 rounded-sm ring-1 ring-border/50"
                          width={16}
                          height={16}
                        />
                      </Link>
                      <AddressDisplay address={currentOwner} />
                    </div>
                  ) : (
                    <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
                      —
                    </span>
                  )}
                </div>
              )}

              {showSide && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                    Side
                  </div>
                  <div className="flex items-center h-[24px] text-sm md:text-base font-medium font-mono text-foreground">
                    {isPredictorSide ? 'PREDICTOR' : 'COUNTERPARTY'}
                  </div>
                </div>
              )}

              {showPicks && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                    Picks
                  </div>
                  <div className="flex items-center h-[24px] text-sm md:text-base font-medium tabular-nums text-foreground">
                    {pickCount}
                  </div>
                </div>
              )}

              {showPositionStatus && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                    Status
                  </div>
                  <div className="flex items-center h-[24px]">
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
                  </div>
                </div>
              )}

              {kind !== 'position' &&
                renderPartyCell('Predictor', predictorAddress)}
              {kind !== 'position' &&
                renderPartyCell('Counterparty', counterpartyAddress)}
            </div>
          )}

          {/* Legacy stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                {endsAtMs && endsAtMs > Date.now()
                  ? 'Ends'
                  : kind === 'position'
                    ? 'Ended'
                    : 'Created'}
              </div>
              <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
                {endsAtMs && endsAtMs > Date.now() ? (
                  <CountdownCell endTime={Math.floor(endsAtMs / 1000)} />
                ) : kind === 'position' ? (
                  endsAtMs ? (
                    <span title={new Date(endsAtMs).toLocaleString()}>
                      {new Date(endsAtMs).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  ) : (
                    '—'
                  )
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

            <div className="flex flex-col gap-1 min-w-0">
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

            <div className="flex flex-col gap-1 min-w-0">
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

            <div className="flex flex-col gap-1 min-w-0">
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
        </>
      )}
    </div>
  );
}
