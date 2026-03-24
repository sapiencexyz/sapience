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
import { Loader2, Check } from 'lucide-react';
import type { SecondaryValidatedBid } from '@sapience/sdk/types/secondary';
import NumberDisplay from '~/components/shared/NumberDisplay';
import CountdownCell from '~/components/shared/CountdownCell';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Bids</DialogTitle>
        </DialogHeader>

        {sortedBids.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No bids yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedBids.map((bid) => {
              let priceValue: number;
              try {
                priceValue = parseFloat(formatEther(BigInt(bid.price)));
              } catch {
                priceValue = 0;
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
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-1 text-brand-white">
                      <span className="font-mono text-muted-foreground">
                        BIDDER:
                      </span>
                      <EnsAvatar address={bid.buyer} width={16} height={16} />
                      <AddressDisplay address={bid.buyer} />
                    </div>
                    <p className="font-mono text-ethena">
                      OFFER:{' '}
                      <NumberDisplay
                        value={priceValue}
                        appendedText={collateralSymbol}
                      />
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-muted-foreground">
                        EXPIRES:
                      </span>
                      <CountdownCell endTime={bid.buyerDeadline} />
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleAccept(bid)}
                    disabled={isAccepting || isExpired}
                  >
                    {isAccepting && isSelected ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Accepting...
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
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
