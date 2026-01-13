'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { formatEther } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PlaceBidForm from '~/components/terminal/PlaceBidForm';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sapience/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useLastTradeForIntent } from '~/hooks/graphql/useLastTradeForIntent';
import TradePopoverContent from '~/components/terminal/TradePopoverContent';
import ExpiresInLabel from '~/components/terminal/ExpiresInLabel';
import PercentChance from '~/components/shared/PercentChance';
import { decodeAuctionPredictedOutcomes } from '~/lib/auction/decodePredictedOutcomes';

type SubmitData = {
  amount: string;
  expirySeconds: number;
  mode: 'duration' | 'datetime';
};

type Props = {
  uiTx: UiTransaction;
  bids: any[] | undefined;
  takerWager: string | null;
  collateralAssetTicker: string;
  onSubmit: (data: SubmitData) => void | Promise<void>;
  maxEndTimeSec?: number | null;
  taker?: string | null;
  resolver?: string | null;
  predictedOutcomes?: string[];
};

type BestBidProps = {
  uiTx: UiTransaction;
  sortedBids: any[];
  now: number;
  takerWager: string | null;
  collateralAssetTicker: string;
  lastTrade: {
    takerStr: string;
    toWinStr: string;
    takerNum: number;
    totalNum: number;
    pct?: number;
  } | null;
  lastBid: any;
  lastTradeTimeAgo: string | null;
};

const BestBid: React.FC<BestBidProps> = ({
  uiTx,
  sortedBids,
  now,
  takerWager,
  collateralAssetTicker,
  lastTrade,
  lastBid,
  lastTradeTimeAgo,
}) => {
  const topUnexpiredBid = useMemo(() => {
    try {
      for (const b of sortedBids || []) {
        const deadlineSec = Number(b?.makerDeadline || 0);
        const ms =
          Number.isFinite(deadlineSec) && deadlineSec > 0
            ? deadlineSec * 1000
            : Number.POSITIVE_INFINITY;
        if (ms > now) return b;
      }
      return null as any;
    } catch {
      return null as any;
    }
  }, [sortedBids, now]);
  return (
    <div>
      <div className="text-xs mt-0 mb-1">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Best Bid</span>
          <div className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">Last Trade:</span>
            {typeof lastTrade?.pct === 'number' ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="font-mono text-brand-white underline decoration-dotted underline-offset-2 hover:opacity-90"
                  >
                    <PercentChance
                      probability={lastTrade.pct / 100}
                      showLabel={true}
                      label="chance"
                      className="font-mono text-ethena whitespace-nowrap"
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(520px,90vw)] rounded-md bg-background border border-border px-3 py-2.5"
                >
                  <TradePopoverContent
                    leftAddress={lastBid?.maker || ''}
                    rightAddress={uiTx?.position?.owner || ''}
                    takerAmountEth={lastTrade.takerNum}
                    totalAmountEth={lastTrade.totalNum}
                    percent={lastTrade.pct}
                    ticker={collateralAssetTicker}
                    timeLabel={lastTradeTimeAgo}
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
      <div className="max-h-[160px] overflow-y-auto overflow-x-auto mt-0 rounded-md bg-background border border-border px-2 py-1">
        <table className="w-full text-xs">
          <tbody>
            {topUnexpiredBid ? (
              (() => {
                const b = topUnexpiredBid;
                const deadlineSec = Number(b?.makerDeadline || 0);
                const secondsRemaining = (() => {
                  if (!Number.isFinite(deadlineSec) || deadlineSec <= 0)
                    return null;
                  const ms = deadlineSec * 1000;
                  const diff = Math.max(0, Math.round((ms - now) / 1000));
                  return diff;
                })();
                const toWinStr = (() => {
                  try {
                    const maker = BigInt(String(takerWager ?? '0'));
                    const taker = BigInt(String(b?.makerWager ?? '0'));
                    return (maker + taker).toString();
                  } catch {
                    return String(b?.makerWager || '0');
                  }
                })();
                let toWinNumber = 0;
                let takerNumber = 0;
                try {
                  toWinNumber = Number(formatEther(BigInt(toWinStr)));
                } catch {
                  toWinNumber = Number(toWinStr) || 0;
                }
                try {
                  takerNumber = Number(
                    formatEther(BigInt(String(b?.makerWager ?? '0')))
                  );
                } catch {
                  takerNumber = 0;
                }
                let pct: number | null = null;
                try {
                  const maker = BigInt(String(takerWager ?? '0'));
                  const taker = BigInt(String(b?.makerWager ?? '0'));
                  const total = maker + taker;
                  if (total > 0n) {
                    const pctTimes100 = Number((taker * 10000n) / total);
                    pct = Math.round(pctTimes100 / 100);
                  }
                } catch {
                  /* noop */
                }
                const takerStr = Number.isFinite(takerNumber)
                  ? takerNumber.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '—';
                const toWinDisplay = Number.isFinite(toWinNumber)
                  ? toWinNumber.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '—';
                return (
                  <tr key="best-bid" className={'border-b last:border-b-0'}>
                    <td className="px-0 py-1.5 align-top" colSpan={2}>
                      <div>
                        <div className="flex items-baseline justify-between">
                          <span className="align-baseline">
                            <span className="font-mono text-brand-white">
                              {takerStr} {collateralAssetTicker}
                            </span>{' '}
                            <br className="sm:hidden" />
                            <span className="text-muted-foreground">
                              to win
                            </span>{' '}
                            <span className="font-mono text-brand-white">
                              {toWinDisplay} {collateralAssetTicker}
                            </span>
                          </span>
                          {typeof pct === 'number' ? (
                            <PercentChance
                              probability={pct / 100}
                              showLabel={true}
                              label="chance"
                              className="font-mono text-ethena whitespace-nowrap"
                            />
                          ) : (
                            <span />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-0.5">
                          <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                            <div className="inline-flex items-center gap-1 min-w-0">
                              <EnsAvatar
                                address={b?.maker || ''}
                                className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                                width={16}
                                height={16}
                              />
                              <div className="min-w-0">
                                <AddressDisplay
                                  address={b?.maker || ''}
                                  compact
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-xs">
                            <ExpiresInLabel
                              secondsRemaining={secondsRemaining}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })()
            ) : (
              <tr>
                <td
                  className="px-0 py-0 text-xs text-muted-foreground"
                  colSpan={2}
                >
                  <div className="h-[45px] flex items-center justify-center">
                    No active bids
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AuctionRequestInfo: React.FC<Props> = ({
  uiTx,
  bids,
  takerWager,
  collateralAssetTicker,
  onSubmit,
  maxEndTimeSec,
  taker,
  resolver,
  predictedOutcomes,
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const takerAmountDisplay = useMemo(() => {
    try {
      return Number(formatEther(BigInt(String(takerWager ?? '0'))));
    } catch {
      return 0;
    }
  }, [takerWager]);

  const highestTakerBidDisplay = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return 0;
      const maxWei = bids.reduce((m, b) => {
        try {
          const v = BigInt(String(b?.makerWager ?? '0'));
          return v > m ? v : m;
        } catch {
          return m;
        }
      }, 0n);
      return Number(formatEther(maxWei));
    } catch {
      return 0;
    }
  }, [bids]);

  const lastBid = useMemo(() => {
    if (!Array.isArray(bids) || bids.length === 0) return null as any;
    return bids.reduce((latest, b) => {
      const t = Number(b?.receivedAtMs || 0);
      const lt = Number(latest?.receivedAtMs || 0);
      return t > lt ? b : latest;
    }, bids[0]);
  }, [bids]);

  // GraphQL-sourced Last Trade based on maker + predicted outcomes signature
  const outcomesSignature = useMemo(() => {
    try {
      const decoded = decodeAuctionPredictedOutcomes({
        resolver,
        predictedOutcomes,
      });
      if (decoded.kind === 'uma') {
        const norm = decoded.outcomes
          .map((o) => ({
            conditionId: String(o.marketId).toLowerCase(),
            prediction: !!o.prediction,
          }))
          .sort((a, b) =>
            a.conditionId === b.conditionId
              ? Number(a.prediction) - Number(b.prediction)
              : a.conditionId.localeCompare(b.conditionId)
          );
        return JSON.stringify(norm);
      }
      if (decoded.kind === 'pyth') {
        const norm = decoded.outcomes
          .map((o) => ({
            priceId: String(o.priceId).toLowerCase(),
            endTime: o.endTime.toString(),
            strikePrice: o.strikePrice.toString(),
            strikeExpo: Number(o.strikeExpo),
            overWinsOnTie: !!o.overWinsOnTie,
            prediction: !!o.prediction,
          }))
          .sort((a, b) =>
            a.priceId === b.priceId
              ? a.endTime.localeCompare(b.endTime)
              : a.priceId.localeCompare(b.priceId)
          );
        return JSON.stringify(norm);
      }
      return null;
    } catch {
      return null;
    }
  }, [predictedOutcomes, resolver]);

  const { data: lastPosition, refetch: refetchLastTrade } =
    useLastTradeForIntent({
      predictor: taker || uiTx?.position?.owner,
      outcomesSignature: outcomesSignature,
    });

  // Trigger refetch on mount (row expand) and when a bid is submitted
  useEffect(() => {
    refetchLastTrade();
    const onBidSubmitted = () => refetchLastTrade();
    window.addEventListener('auction.bid.submitted', onBidSubmitted);
    return () =>
      window.removeEventListener('auction.bid.submitted', onBidSubmitted);
  }, []);

  const lastTrade = useMemo(() => {
    try {
      if (!lastPosition) return null;
      const predictorWei = BigInt(
        String(lastPosition?.predictorCollateral ?? '0')
      );
      const counterpartyWei = BigInt(
        String(lastPosition?.counterpartyCollateral ?? '0')
      );
      const counterpartyEth = Number(formatEther(counterpartyWei));
      const totalEth = Number(formatEther(predictorWei + counterpartyWei));
      const pct =
        Number.isFinite(counterpartyEth) &&
        Number.isFinite(totalEth) &&
        totalEth > 0
          ? Math.round((counterpartyEth / totalEth) * 100)
          : undefined;
      return {
        takerStr: counterpartyEth.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        toWinStr: totalEth.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        takerNum: counterpartyEth,
        totalNum: totalEth,
        pct,
      } as const;
    } catch {
      return null;
    }
  }, [lastPosition]);

  const lastTradeTimeAgo = useMemo(() => {
    try {
      const ms = lastPosition ? Number(lastPosition.mintedAt) * 1000 : 0;
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return formatDistanceToNowStrict(new Date(ms), { addSuffix: true });
    } catch {
      return null;
    }
  }, [lastPosition, now]);

  const maxDurationLabel = useMemo(() => {
    try {
      const endSec = Number(maxEndTimeSec || 0);
      if (!Number.isFinite(endSec) || endSec <= 0) return null;
      return formatDistanceToNowStrict(new Date(endSec * 1000));
    } catch {
      return null;
    }
  }, [maxEndTimeSec, now]);

  const maxRemainingExpirySeconds = useMemo(() => {
    try {
      const endSec = Number(maxEndTimeSec || 0);
      if (!Number.isFinite(endSec) || endSec <= 0) return undefined;
      const remain = Math.max(0, Math.floor(endSec - Math.floor(now / 1000)));
      return remain > 0 ? remain : undefined;
    } catch {
      return undefined;
    }
  }, [maxEndTimeSec, now]);

  const winningBid = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return null as any;
      const candidates = bids.filter((b) => {
        const deadlineSec = Number(b?.makerDeadline || 0);
        if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return true;
        return deadlineSec * 1000 > now;
      });
      if (candidates.length === 0) return null as any;
      return candidates.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.makerWager ?? '0'));
          const bestVal = BigInt(String(best?.makerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, candidates[0]);
    } catch {
      return null as any;
    }
  }, [bids, now]);

  // No separate Highest Bid summary row; top bid appears first in the list below

  const sortedBids: any[] = useMemo(() => {
    const list = Array.isArray(bids) ? [...bids] : [];
    const withSortKey = list.map((b) => {
      let wager = 0n;
      try {
        wager = BigInt(String(b?.makerWager ?? '0'));
      } catch {
        wager = 0n;
      }
      return { ...b, __wager: wager };
    });
    withSortKey.sort((a, b) =>
      a.__wager < b.__wager ? 1 : a.__wager > b.__wager ? -1 : 0
    );
    // Ensure current winning (active highest) is first if present
    if (winningBid) {
      const idx = withSortKey.findIndex((x) => x === winningBid);
      if (idx > 0) {
        const [w] = withSortKey.splice(idx, 1);
        withSortKey.unshift(w);
      }
    }
    return withSortKey;
  }, [bids, winningBid]);

  // removed unused maxDurationLabel (handled in parent row)

  return (
    <div className="md:col-span-2">
      <div className="text-xs mt-0 mb-1">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Submit Bid</span>
          <div className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">Maximum Duration:</span>
            <span className="font-mono text-brand-white">
              {maxDurationLabel ?? '—'}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-pointer self-center" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span>
                    Time remaining until the latest end time across all
                    predictions.
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
      <PlaceBidForm
        collateralAssetTicker={collateralAssetTicker}
        decimals={2}
        variant="compact"
        makerAmountDisplay={takerAmountDisplay}
        bestBidDisplay={highestTakerBidDisplay}
        onSubmit={onSubmit}
        maxExpirySeconds={maxRemainingExpirySeconds}
      />

      <div className="mt-1 pt-1">
        {/**
         * LastTrade temporarily disabled per request
         *
         * <div>
         *   <LastTrade
         *     uiTx={uiTx}
         *     lastTrade={lastTrade}
         *     lastBid={lastBid}
         *     lastTradeTimeAgo={lastTradeTimeAgo}
         *     collateralAssetTicker={collateralAssetTicker}
         *   />
         * </div>
         */}
        <div>
          <BestBid
            uiTx={uiTx}
            sortedBids={sortedBids}
            now={now}
            takerWager={takerWager}
            collateralAssetTicker={collateralAssetTicker}
            lastTrade={lastTrade}
            lastBid={lastBid}
            lastTradeTimeAgo={lastTradeTimeAgo}
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionRequestInfo;
