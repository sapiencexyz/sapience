'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import AuctionBidsChart from '~/components/shared/AuctionBidsChart';
import { formatUnits } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { Info } from 'lucide-react';
import type { AuctionBid } from '~/lib/auction/useAuctionBids';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type Props = {
  bids: AuctionBid[];
  refreshMs?: number;
  predictorCollateral: string | null;
  collateralAssetTicker: string;
  maxEndTimeSec?: number;
  predictor?: string | null;
  hasMultipleConditions?: boolean;
  tokenDecimals: number;
  invalidBidCount?: number;
};

const AuctionRequestChart: React.FC<Props> = ({
  bids,
  refreshMs = 90,
  predictorCollateral,
  collateralAssetTicker,
  maxEndTimeSec: _maxEndTimeSec,
  predictor,
  hasMultipleConditions,
  tokenDecimals,
  invalidBidCount = 0,
}) => {
  // Throttle incoming bids to ~10–12 fps using rAF
  const [displayBids, setDisplayBids] = useState<AuctionBid[]>(bids || []);
  const pendingRef = useRef<AuctionBid[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRenderRef = useRef<number>(0);
  const minFrameMs = 90; // ~11 fps

  useEffect(() => {
    pendingRef.current = bids || [];
    const loop = (t: number) => {
      const now = t || performance.now();
      const elapsed = now - (lastRenderRef.current || 0);
      if (elapsed >= minFrameMs) {
        lastRenderRef.current = now;
        if (pendingRef.current) setDisplayBids(pendingRef.current);
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };
    if (rafRef.current == null) {
      rafRef.current = window.requestAnimationFrame(loop);
    }
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [bids]);

  const predictorAmountDisplay = (() => {
    try {
      return Number(
        formatUnits(BigInt(String(predictorCollateral ?? '0')), tokenDecimals)
      );
    } catch {
      return 0;
    }
  })();

  const normalizedPredictor = predictor?.toLowerCase();
  const showRequester =
    !!normalizedPredictor && normalizedPredictor !== ZERO_ADDRESS.toLowerCase();

  return (
    <div className="md:col-span-2 h-full min-h-0 flex flex-col">
      <div className="text-xs mt-0 mb-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <span className="font-medium">Live Auction</span>
          {hasMultipleConditions ? (
            <div className="text-muted-foreground inline-flex items-center gap-1">
              <Info className="h-3 w-3 opacity-70" strokeWidth={2.5} />
              <span className="font-medium">
                Only one correct prediction needed to win
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mb-2">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 min-w-0">
          <span className="font-mono text-brand-white">
            {Number.isFinite(predictorAmountDisplay)
              ? predictorAmountDisplay.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'}{' '}
            {collateralAssetTicker}
          </span>
          <span className="text-muted-foreground">position request</span>
          {showRequester ? (
            <div className="w-full sm:w-auto inline-flex items-center gap-1 min-w-0">
              <span className="text-muted-foreground">from</span>
              <div className="inline-flex items-center gap-1 min-w-0">
                <EnsAvatar
                  address={predictor || ''}
                  className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                  width={16}
                  height={16}
                />
                <div className="min-w-0">
                  <AddressDisplay address={predictor || ''} compact />
                </div>
              </div>
            </div>
          ) : null}
        </div>
        {invalidBidCount > 0 ? (
          <span className="text-muted-foreground whitespace-nowrap">
            {invalidBidCount} invalid bid{invalidBidCount === 1 ? '' : 's'}{' '}
            hidden
          </span>
        ) : (
          <div />
        )}
      </div>
      <div className="h-[110px] md:h-auto md:flex-1 md:min-h-0">
        <AuctionBidsChart
          bids={displayBids}
          continuous
          refreshMs={refreshMs}
          predictorCollateral={predictorCollateral}
          predictor={predictor}
          collateralAssetTicker={collateralAssetTicker}
        />
      </div>
    </div>
  );
};

export default AuctionRequestChart;
