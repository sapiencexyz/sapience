'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { formatEther } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PlaceBidForm from '~/components/terminal/PlaceBidForm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import ExpiresInLabel from '~/components/shared/ExpiresInLabel';
import PercentChance from '~/components/shared/PercentChance';

type SubmitData = {
  amount: string;
  expirySeconds: number;
  mode: 'duration' | 'datetime';
};

interface BidEntry {
  counterparty?: string;
  counterpartyCollateral?: string;
  counterpartyDeadline?: number;
  counterpartySignature?: string;
  counterpartyNonce?: number;
  [key: string]: unknown;
}

type Props = {
  bids: BidEntry[] | undefined;
  predictorCollateral: string | null;
  collateralAssetTicker: string;
  onSubmit: (data: SubmitData) => void | Promise<void>;
  maxEndTimeSec?: number | null;
};

type BestBidProps = {
  sortedBids: BidEntry[];
  now: number;
  predictorCollateral: string | null;
  collateralAssetTicker: string;
};

const BestBid: React.FC<BestBidProps> = ({
  sortedBids,
  now,
  predictorCollateral,
  collateralAssetTicker,
}) => {
  const topUnexpiredBid = useMemo(() => {
    try {
      for (const b of sortedBids || []) {
        // Skip zero address bids
        if (
          !b?.counterparty ||
          b.counterparty.toLowerCase() ===
            '0x0000000000000000000000000000000000000000'
        )
          continue;
        const deadlineSec = Number(b?.counterpartyDeadline || 0);
        const ms =
          Number.isFinite(deadlineSec) && deadlineSec > 0
            ? deadlineSec * 1000
            : Number.POSITIVE_INFINITY;
        if (ms > now) return b;
      }
      return null;
    } catch {
      return null;
    }
  }, [sortedBids, now]);
  return (
    <div>
      <div className="text-xs mt-0 mb-1">
        <span className="font-medium">Best Bid</span>
      </div>
      <div className="max-h-[160px] overflow-y-auto overflow-x-auto mt-0 rounded-md bg-background border border-border px-2 py-1">
        <table className="w-full text-xs">
          <tbody>
            {topUnexpiredBid ? (
              (() => {
                const b = topUnexpiredBid;
                const deadlineSec = Number(b?.counterpartyDeadline || 0);
                const secondsRemaining = (() => {
                  if (!Number.isFinite(deadlineSec) || deadlineSec <= 0)
                    return null;
                  const ms = deadlineSec * 1000;
                  const diff = Math.max(0, Math.round((ms - now) / 1000));
                  return diff;
                })();
                const payoutStr = (() => {
                  try {
                    const predictorWei = BigInt(
                      String(predictorCollateral ?? '0')
                    );
                    const counterpartyWei = BigInt(
                      String(b?.counterpartyCollateral ?? '0')
                    );
                    return (predictorWei + counterpartyWei).toString();
                  } catch {
                    return String(b?.counterpartyCollateral || '0');
                  }
                })();
                let payoutNumber = 0;
                let counterpartyNumber = 0;
                try {
                  payoutNumber = Number(formatEther(BigInt(payoutStr)));
                } catch {
                  payoutNumber = Number(payoutStr) || 0;
                }
                try {
                  counterpartyNumber = Number(
                    formatEther(
                      BigInt(String(b?.counterpartyCollateral ?? '0'))
                    )
                  );
                } catch {
                  counterpartyNumber = 0;
                }
                let pct: number | null = null;
                try {
                  const predictorWei = BigInt(
                    String(predictorCollateral ?? '0')
                  );
                  const counterpartyWei = BigInt(
                    String(b?.counterpartyCollateral ?? '0')
                  );
                  const total = predictorWei + counterpartyWei;
                  if (total > 0n) {
                    const pctTimes100 = Number(
                      (counterpartyWei * 10000n) / total
                    );
                    pct = Math.round(pctTimes100 / 100);
                  }
                } catch {
                  /* noop */
                }
                const counterpartyStr = Number.isFinite(counterpartyNumber)
                  ? counterpartyNumber.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '—';
                const payoutDisplay = Number.isFinite(payoutNumber)
                  ? payoutNumber.toLocaleString(undefined, {
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
                              {counterpartyStr} {collateralAssetTicker}
                            </span>{' '}
                            <br className="sm:hidden" />
                            <span className="text-muted-foreground">
                              for payout
                            </span>{' '}
                            <span className="font-mono text-brand-white">
                              {payoutDisplay} {collateralAssetTicker}
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
                                address={b?.counterparty || ''}
                                className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                                width={16}
                                height={16}
                              />
                              <div className="min-w-0">
                                <AddressDisplay
                                  address={b?.counterparty || ''}
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
  bids,
  predictorCollateral,
  collateralAssetTicker,
  onSubmit,
  maxEndTimeSec,
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const predictorAmountDisplay = useMemo(() => {
    try {
      return Number(formatEther(BigInt(String(predictorCollateral ?? '0'))));
    } catch {
      return 0;
    }
  }, [predictorCollateral]);

  const highestCounterpartyBidDisplay = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return 0;
      const maxWei = bids.reduce((m, b) => {
        try {
          const v = BigInt(String(b?.counterpartyCollateral ?? '0'));
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
      if (!Array.isArray(bids) || bids.length === 0) return null;
      const candidates = bids.filter((b) => {
        // Filter out zero address bids
        if (
          !b?.counterparty ||
          b.counterparty.toLowerCase() ===
            '0x0000000000000000000000000000000000000000'
        )
          return false;
        const deadlineSec = Number(b?.counterpartyDeadline || 0);
        if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return true;
        return deadlineSec * 1000 > now;
      });
      if (candidates.length === 0) return null;
      return candidates.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.counterpartyCollateral ?? '0'));
          const bestVal = BigInt(String(best?.counterpartyCollateral ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, candidates[0]);
    } catch {
      return null;
    }
  }, [bids, now]);

  // No separate Highest Bid summary row; top bid appears first in the list below

  const sortedBids: BidEntry[] = useMemo(() => {
    const list = Array.isArray(bids) ? [...bids] : [];
    const withSortKey = list.map((b) => {
      let positionSize = 0n;
      try {
        positionSize = BigInt(String(b?.counterpartyCollateral ?? '0'));
      } catch {
        positionSize = 0n;
      }
      return { ...b, __positionSize: positionSize };
    });
    withSortKey.sort((a, b) =>
      a.__positionSize < b.__positionSize
        ? 1
        : a.__positionSize > b.__positionSize
          ? -1
          : 0
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
        predictorAmountDisplay={predictorAmountDisplay}
        bestBidDisplay={highestCounterpartyBidDisplay}
        onSubmit={onSubmit}
        maxExpirySeconds={maxRemainingExpirySeconds}
      />

      <div className="mt-1 pt-1">
        <div>
          <BestBid
            sortedBids={sortedBids}
            now={now}
            predictorCollateral={predictorCollateral}
            collateralAssetTicker={collateralAssetTicker}
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionRequestInfo;
