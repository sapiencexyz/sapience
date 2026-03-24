'use client';

import * as React from 'react';
import { formatEther, type Address } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import { Badge } from '@sapience/ui/components/ui/badge';
import { Loader2, Check } from 'lucide-react';
import type { SecondaryValidatedBid } from '@sapience/sdk/types/secondary';
import { useSecondaryAccept } from '~/hooks/secondary/useSecondaryAccept';
import type { SecondaryListing } from '~/hooks/secondary/useSecondaryFeed';

interface AcceptBidDialogProps {
  listing: SecondaryListing;
  collateralSymbol: string;
  onSuccess?: () => void;
  children: React.ReactNode;
}

export default function AcceptBidDialog({
  listing,
  collateralSymbol,
  onSuccess,
  children,
}: AcceptBidDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedBid, setSelectedBid] =
    React.useState<SecondaryValidatedBid | null>(null);

  const { acceptBid, isAccepting } = useSecondaryAccept({
    onSignatureRejected: (err) => setError(err.message),
    onSuccess: () => {
      setOpen(false);
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  const handleAccept = React.useCallback(
    async (bid: SecondaryValidatedBid) => {
      setError(null);
      setSelectedBid(bid);

      try {
        const result = await acceptBid({
          token: listing.token as Address,
          tokenAmount: BigInt(listing.tokenAmount),
          bid,
        });

        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Failed to execute trade'
        );
      }
    },
    [listing, acceptBid]
  );

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setError(null);
      setSelectedBid(null);
    }
  }, [open]);

  const sortedBids = React.useMemo(
    () =>
      [...listing.bids].sort((a, b) => {
        const diff = BigInt(b.price) - BigInt(a.price);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }),
    [listing.bids]
  );

  let tokenAmountDisplay: string;
  try {
    tokenAmountDisplay = formatEther(BigInt(listing.tokenAmount));
  } catch {
    return null; // Malformed listing data — don't render
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Bids on Your Listing ({listing.bids.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Token:{' '}
            <span className="font-mono">
              {listing.token.slice(0, 6)}…{listing.token.slice(-4)}
            </span>
          </p>
          <p>Selling: {tokenAmountDisplay} tokens</p>
        </div>

        {sortedBids.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No bids yet. Waiting for buyers…
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedBids.map((bid, i) => {
              let priceDisplay: string;
              try {
                priceDisplay = formatEther(BigInt(bid.price));
              } catch {
                priceDisplay = '—';
              }
              const isSelected =
                selectedBid?.buyerSignature === bid.buyerSignature;
              const deadline = new Date(bid.buyerDeadline * 1000);
              const isExpired = deadline < new Date();

              return (
                <div
                  key={`${bid.buyer}-${bid.buyerNonce}`}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {bid.buyer.slice(0, 6)}…{bid.buyer.slice(-4)}
                      </span>
                      {i === 0 && (
                        <Badge variant="default" className="text-xs">
                          Best
                        </Badge>
                      )}
                      {isExpired && (
                        <Badge variant="destructive" className="text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {priceDisplay} {collateralSymbol}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleAccept(bid)}
                    disabled={isAccepting || isExpired}
                  >
                    {isAccepting && isSelected ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Accepting…
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Accept
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
