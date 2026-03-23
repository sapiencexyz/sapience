'use client';

import * as React from 'react';
import { parseEther, formatEther, type Address } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useSecondaryBid } from '~/hooks/secondary/useSecondaryBid';
import type { SecondaryListing } from '~/hooks/secondary/useSecondaryFeed';

interface BidOnListingDialogProps {
  listing: SecondaryListing;
  collateralSymbol: string;
  onSuccess?: () => void;
  children: React.ReactNode;
}

export default function BidOnListingDialog({
  listing,
  collateralSymbol,
  onSuccess,
  children,
}: BidOnListingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [price, setPrice] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const { submitBid, isSubmitting } = useSecondaryBid({
    onSignatureRejected: (err) => setError(err.message),
    onBidSubmitted: () => {
      setOpen(false);
      onSuccess?.();
    },
  });

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      try {
        if (!price.trim() || !/^\d*\.?\d*$/.test(price.trim())) {
          setError('Please enter a valid number');
          return;
        }
        const priceWei = parseEther(price.trim());

        if (priceWei <= 0n) {
          setError('Price must be greater than 0');
          return;
        }

        const result = await submitBid({
          auctionId: listing.auctionId,
          token: listing.token as Address,
          tokenAmount: BigInt(listing.tokenAmount),
          price: priceWei,
          seller: listing.seller as Address,
        });

        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to submit bid');
      }
    },
    [price, listing, collateralSymbol, submitBid]
  );

  let tokenAmountDisplay: string;
  try {
    tokenAmountDisplay = formatEther(BigInt(listing.tokenAmount));
  } catch {
    return null; // Malformed listing data
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bid on Position Tokens</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Token:{' '}
            <span className="font-mono">
              {listing.token.slice(0, 6)}…{listing.token.slice(-4)}
            </span>
          </p>
          <p>Amount: {tokenAmountDisplay} tokens</p>
          <p>
            Seller:{' '}
            <span className="font-mono">
              {listing.seller.slice(0, 6)}…{listing.seller.slice(-4)}
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bidPrice">Your Offer ({collateralSymbol})</Label>
            <Input
              id="bidPrice"
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.0"
            />

          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !price}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Approving & Signing…
              </>
            ) : (
              'Submit Bid'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
