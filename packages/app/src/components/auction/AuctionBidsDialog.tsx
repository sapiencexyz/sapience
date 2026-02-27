'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { Badge } from '@sapience/ui/components/ui/badge';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import NumberDisplay from '~/components/shared/NumberDisplay';
import type { AuctionDetails, ValidatedBid } from '@sapience/sdk/types';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';

type Props = {
  auctionId: string | null;
  auction: AuctionDetails | null;
  collateralSymbol: string;
};

/**
 * Hook to subscribe to auction bids via WebSocket
 */
function useAuctionBids(auctionId: string | null) {
  const [bids, setBids] = useState<ValidatedBid[]>([]);
  const { apiBaseUrl } = useSettings();
  const wsUrl = toAuctionWsUrl(apiBaseUrl);

  useEffect(() => {
    if (!auctionId || !wsUrl) {
      setBids([]);
      return;
    }

    const client = getSharedAuctionWsClient(wsUrl);

    // Subscribe to auction
    client.send({ type: 'auction.subscribe', payload: { auctionId } });

    // Listen for bid updates
    const removeListener = client.addMessageListener((msg: unknown) => {
      const data = msg as {
        type?: string;
        payload?: { auctionId?: string; bids?: ValidatedBid[] };
      };
      if (
        data?.type === 'auction.bids' &&
        data.payload?.auctionId === auctionId
      ) {
        setBids(data.payload.bids ?? []);
      }
    });

    return () => {
      removeListener();
      client.send({ type: 'auction.unsubscribe', payload: { auctionId } });
    };
  }, [auctionId, wsUrl]);

  return { bids };
}

const AuctionBidsDialog: React.FC<Props> = ({
  auctionId,
  auction,
  collateralSymbol,
}) => {
  const [open, setOpen] = useState(false);
  const { bids } = useAuctionBids(auctionId);
  const [flash, setFlash] = useState(false);
  const prevCountRef = useRef<number>(bids.length);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (prevCountRef.current !== bids.length) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      prevCountRef.current = bids.length;
      return () => clearTimeout(t);
    }
  }, [bids.length]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const predictorCollateralNum = auction?.predictorCollateral
    ? parseFloat(formatEther(BigInt(auction.predictorCollateral)))
    : 0;
  const counterpartyCollateralNum = auction?.counterpartyCollateral
    ? parseFloat(formatEther(BigInt(auction.counterpartyCollateral)))
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="xs"
          className={`transition-colors duration-500 ${
            flash
              ? 'bg-emerald-600 text-emerald-50 hover:bg-emerald-600/90 ring-2 ring-emerald-400/50 shadow shadow-emerald-400/30'
              : ''
          }`}
        >
          {bids.length} Bids
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px] p-0">
        <DialogHeader className="pt-4 pl-4 pr-4">
          <DialogTitle className="flex items-center gap-2">
            Auction Bids
            <Badge variant="outline" className="font-normal">
              {auction?.picks?.length ?? 0} picks
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Auction summary */}
        <div className="px-4 py-2 border-b bg-muted/30">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">
                Predictor Collateral:
              </span>{' '}
              <NumberDisplay
                value={predictorCollateralNum}
                appendedText={collateralSymbol}
              />
            </div>
            <div>
              <span className="text-muted-foreground">
                Counterparty Collateral:
              </span>{' '}
              <NumberDisplay
                value={counterpartyCollateralNum}
                appendedText={collateralSymbol}
              />
            </div>
          </div>
        </div>

        {bids.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-8 text-center">
            No bids yet. Waiting for counterparties to fill this auction.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 text-left align-middle font-medium">
                    Expires
                  </th>
                  <th className="px-4 py-2 text-left align-middle font-medium">
                    Counterparty
                  </th>
                  <th className="px-4 py-2 text-left align-middle font-medium">
                    Their Collateral
                  </th>
                  <th className="px-4 py-2 text-left align-middle font-medium">
                    Total Pool
                  </th>
                  <th className="px-4 py-2 text-left align-middle font-medium">
                    Received
                  </th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid, i) => {
                  const deadlineSec = Number(bid?.counterpartyDeadline || 0);
                  const { label: expiresLabel, isExpired } = (() => {
                    if (!Number.isFinite(deadlineSec) || deadlineSec <= 0)
                      return { label: '—', isExpired: false } as const;
                    const ms = deadlineSec * 1000;
                    if (ms > now) {
                      return {
                        label: formatDistanceToNowStrict(new Date(ms), {
                          unit: 'second',
                        }),
                        isExpired: false,
                      } as const;
                    }
                    return { label: 'Expired', isExpired: true } as const;
                  })();

                  // Per-bid counterparty collateral
                  const bidCounterpartyCollateralNum = bid?.counterpartyCollateral
                    ? parseFloat(formatEther(BigInt(bid.counterpartyCollateral)))
                    : 0;

                  // Calculate total pool using per-bid counterparty collateral
                  const totalPoolNum = (() => {
                    try {
                      const predictor = BigInt(
                        auction?.predictorCollateral ?? '0'
                      );
                      const counterparty = BigInt(
                        bid?.counterpartyCollateral ?? '0'
                      );
                      return parseFloat(formatEther(predictor + counterparty));
                    } catch {
                      return 0;
                    }
                  })();

                  // Format received time
                  const receivedLabel = bid.receivedAt
                    ? formatDistanceToNowStrict(new Date(bid.receivedAt), {
                        addSuffix: true,
                      })
                    : '—';

                  return (
                    <tr
                      key={i}
                      className="border-b last:border-b-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={isExpired ? 'text-destructive' : undefined}
                        >
                          {expiresLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <EnsAvatar
                            address={bid?.counterparty || ''}
                            className="w-5 h-5 rounded-sm ring-1 ring-border/50 shrink-0"
                            width={20}
                            height={20}
                          />
                          <div className="min-w-0">
                            <AddressDisplay
                              address={bid?.counterparty || ''}
                              compact
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <NumberDisplay
                          value={bidCounterpartyCollateralNum}
                          appendedText={collateralSymbol}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <NumberDisplay
                          value={totalPoolNum}
                          appendedText={collateralSymbol}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {receivedLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuctionBidsDialog;
