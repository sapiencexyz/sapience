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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Loader2 } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import CountdownCell from '~/components/shared/CountdownCell';
import PicksPopover from '~/components/shared/PicksPopover';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useEnrichedTokens } from '~/hooks/secondary/useEnrichedTokens';
import { useSecondaryBid } from '~/hooks/secondary/useSecondaryBid';
import type { SecondaryListing } from '~/hooks/secondary/useSecondaryFeed';

const BID_DEADLINE_OPTIONS = [
  { label: '5 minutes', value: '300' },
  { label: '15 minutes', value: '900' },
  { label: '30 minutes', value: '1800' },
  { label: '1 hour', value: '3600' },
];

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
  const [deadlineSeconds, setDeadlineSeconds] = React.useState('900');
  const [error, setError] = React.useState<string | null>(null);

  const tokens = React.useMemo(() => [listing.token], [listing.token]);
  const { map: enrichedMap } = useEnrichedTokens(tokens);
  const enriched = enrichedMap.get(listing.token.toLowerCase());

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
          deadlineSeconds: Number(deadlineSeconds),
        });

        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to submit bid');
      }
    },
    [price, deadlineSeconds, listing, submitBid]
  );

  let tokenAmount: number;
  try {
    tokenAmount = parseFloat(formatEther(BigInt(listing.tokenAmount)));
  } catch {
    return null; // Malformed listing data
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Place a Bid</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground -mt-1">
          The seller will review all bids and choose which to accept.
        </p>

        <div className="border rounded-lg p-3 space-y-1 text-sm">
          <PicksPopover
            picks={enriched?.picks ?? []}
            fallbackAddress={listing.token}
          />
          <div className="flex items-center gap-1">
            <span className="font-mono text-muted-foreground">AMOUNT:</span>
            <span className="font-mono text-brand-white">
              <NumberDisplay value={tokenAmount} />
            </span>
          </div>
          <div className="flex items-center gap-1 text-brand-white">
            <span className="font-mono text-muted-foreground">SELLER:</span>
            <EnsAvatar address={listing.seller} width={16} height={16} />
            <AddressDisplay address={listing.seller} />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-muted-foreground">EXPIRES:</span>
            <CountdownCell endTime={listing.sellerDeadline} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="bidPrice">Your bid</Label>
            <div className="relative">
              <Input
                id="bidPrice"
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.0"
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                {collateralSymbol}
              </span>
            </div>
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
                Approving & Signing...
              </>
            ) : (
              'Submit Bid'
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center -mt-1">
            Bid expires in{' '}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                >
                  {BID_DEADLINE_OPTIONS.find((o) => o.value === deadlineSeconds)
                    ?.label ?? '15 minutes'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="center">
                <div className="flex flex-col gap-1">
                  {BID_DEADLINE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`px-3 py-1.5 text-sm rounded-md text-left hover:bg-accent transition-colors ${opt.value === deadlineSeconds ? 'bg-accent font-medium' : ''}`}
                      onClick={() => setDeadlineSeconds(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
