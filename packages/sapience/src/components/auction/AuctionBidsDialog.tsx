'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { TransactionAmountCell } from '~/components/markets/DataDrawer/TransactionCells';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useAuctionBids } from '~/lib/auction/useAuctionBids';

type Props = {
  auctionId: string | null;
  makerWager: string | null;
  collateralAssetTicker: string;
};

const AuctionBidsDialog: React.FC<Props> = ({
  auctionId,
  makerWager,
  collateralAssetTicker,
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
      <DialogContent className="sm:max-w-[640px] p-0">
        <DialogHeader className="pt-4 pl-3">
          <DialogTitle>Bids</DialogTitle>
        </DialogHeader>
        {bids.length === 0 ? (
          <div className="text-sm text-muted-foreground px-1 py-6 text-center">
            No bids yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Expires in
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Address
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    To Win
                  </th>
                </tr>
              </thead>
              <tbody>
                {bids.map((b, i) => {
                  const deadlineSec = Number(b?.takerDeadline || 0);
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
                  const toWinStr = (() => {
                    try {
                      const maker = BigInt(String(makerWager ?? '0'));
                      const taker = BigInt(String(b?.takerWager ?? '0'));
                      return (maker + taker).toString();
                    } catch {
                      return String(b?.takerWager || '0');
                    }
                  })();
                  const uiTxAmount = {
                    id: i,
                    type: 'FORECAST',
                    createdAt: new Date().toISOString(),
                    collateral: String(b?.takerWager || '0'),
                    position: { owner: b?.taker || '' },
                  } as any;
                  const uiTxToWin = {
                    ...uiTxAmount,
                    collateral: toWinStr,
                  };
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={isExpired ? 'text-destructive' : undefined}
                        >
                          {expiresLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <EnsAvatar
                            address={b?.taker || ''}
                            className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                            width={16}
                            height={16}
                          />
                          <div className="[&_span.font-mono]:text-foreground min-w-0">
                            <AddressDisplay address={b?.taker || ''} compact />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <TransactionAmountCell
                          tx={uiTxAmount}
                          collateralAssetTicker={collateralAssetTicker}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <TransactionAmountCell
                          tx={uiTxToWin}
                          collateralAssetTicker={collateralAssetTicker}
                        />
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
