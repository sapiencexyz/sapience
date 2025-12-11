'use client';

import type React from 'react';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PercentChance from '~/components/shared/PercentChance';

type TradePopoverContentProps = {
  leftAddress: string;
  rightAddress: string;
  takerAmountEth: number;
  totalAmountEth: number;
  percent?: number;
  ticker: string;
  timeLabel?: string | null;
  timeNode?: React.ReactNode;
};

const TradePopoverContent: React.FC<TradePopoverContentProps> = ({
  leftAddress,
  rightAddress: _rightAddress,
  takerAmountEth,
  totalAmountEth,
  percent,
  ticker,
  timeLabel,
  timeNode,
}) => {
  const takerStr = Number.isFinite(takerAmountEth)
    ? takerAmountEth.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
  const toWinStr = Number.isFinite(totalAmountEth)
    ? totalAmountEth.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';

  return (
    <div className="text-xs space-y-1">
      {/* Line 1: x to win y */}
      <div className="text-sm">
        <span className="font-mono font-normal text-brand-white">
          {takerStr} {ticker}
        </span>{' '}
        <span className="text-muted-foreground">to win</span>{' '}
        <span className="font-mono font-normal text-brand-white">
          {toWinStr} {ticker}
        </span>
      </div>

      {/* Line 2: from address (only show if valid non-zero address) */}
      {leftAddress &&
        leftAddress !== '0x0000000000000000000000000000000000000000' && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="text-sm mr-1">bid from</span>
            <EnsAvatar
              address={leftAddress}
              className="w-3 h-3 rounded-[2px] ring-1 ring-border/50 shrink-0"
              width={12}
              height={12}
            />
            <div className="min-w-0">
              <AddressDisplay address={leftAddress} compact />
            </div>
          </div>
        )}

      {/* Line 3: expires first, separator, then percent */}
      <div className="flex items-center gap-2">
        {timeNode ? (
          <div className="text-xs whitespace-nowrap">{timeNode}</div>
        ) : timeLabel ? (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {timeLabel}
          </div>
        ) : null}
        {(timeNode || timeLabel) && typeof percent === 'number' && (
          <span className="h-2.5 w-px bg-border/50" />
        )}
        {typeof percent === 'number' && (
          <span>
            <PercentChance
              probability={percent / 100}
              showLabel={true}
              label="chance"
              className="font-mono text-ethena"
            />
            <span className="text-muted-foreground"> implied</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default TradePopoverContent;
