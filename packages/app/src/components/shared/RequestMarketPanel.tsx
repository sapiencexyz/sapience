'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sapience/ui/components/ui/dialog';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useRequestMarket } from '~/hooks/markets/useRequestMarket';

function looksLikePolymarketUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true; // empty is fine (optional)
  try {
    const url = new URL(v);
    const host = url.hostname.toLowerCase();
    return host === 'polymarket.com' || host.endsWith('.polymarket.com');
  } catch {
    return false;
  }
}

/**
 * Shown in the questions-table empty state: a short "we haven't listed this yet"
 * message plus a button that opens a dialog where the user can name the market
 * (prefilled with their search) and optionally attach a Polymarket link.
 * Submitting pings the team via Discord (handled API-side); on success the
 * dialog closes and a toast confirms the request.
 */
export default function RequestMarketPanel({ ticker }: { ticker: string }) {
  const { address } = useAccount();
  const { toast } = useToast();
  const { mutate, status, reset } = useRequestMarket();
  const [open, setOpen] = React.useState(false);
  const [market, setMarket] = React.useState(ticker);
  const [polymarketUrl, setPolymarketUrl] = React.useState('');

  const trimmedTicker = ticker.trim();

  // Reset the dialog state whenever the user opens it (so a fresh search term
  // prefills the field and any previous error is cleared).
  React.useEffect(() => {
    if (open) {
      reset();
      setMarket(ticker);
      setPolymarketUrl('');
    }
  }, [open, ticker, reset]);

  const trimmedMarket = market.trim();
  const urlValid = looksLikePolymarketUrl(polymarketUrl);
  const isSubmitting = status === 'pending';
  const canSubmit = !!trimmedMarket && urlValid && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const requested = trimmedMarket;
    mutate(
      {
        ticker: requested,
        polymarketUrl: polymarketUrl.trim() || undefined,
        walletAddress: address,
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast({
            title: 'Request received',
            description: `Thanks — we'll take a look at ${requested}.`,
            duration: 5000,
          });
        },
      }
    );
  };

  return (
    <>
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {trimmedTicker ? (
            <>
              Oops, looks like we haven&apos;t listed{' '}
              <span className="font-mono text-brand-white">
                {trimmedTicker}
              </span>{' '}
              yet.
            </>
          ) : (
            <>No results found.</>
          )}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          Request {trimmedTicker || 'a market'}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Request a Market</DialogTitle>
            <DialogDescription>
              Tell us what you&apos;d like to predict on and we&apos;ll take a
              look.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5 pb-2">
              <Label htmlFor="request-market-name">Market</Label>
              <Input
                id="request-market-name"
                autoFocus
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder="e.g. BTC above $150k by end of year"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-market-link">
                Polymarket Link{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="request-market-link"
                value={polymarketUrl}
                onChange={(e) => setPolymarketUrl(e.target.value)}
                placeholder="https://polymarket.com/event/..."
                aria-invalid={!urlValid}
              />
              {!urlValid && (
                <span className="text-xs text-destructive">
                  Enter a valid polymarket.com link, or leave it blank.
                </span>
              )}
            </div>

            {status === 'error' && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                Something went wrong. Try again.
              </span>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Requesting…
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
