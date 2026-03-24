'use client';

import * as React from 'react';
import { parseEther, formatEther, type Address } from 'viem';
import { useRouter } from 'next/navigation';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import { Loader2 } from 'lucide-react';
import type { PositionBalance } from '~/hooks/graphql/usePositions';
import { useSecondaryAuctionStart } from '~/hooks/secondary/useSecondaryAuction';

const DEADLINE_OPTIONS = [
  { label: '5 minutes', value: '300' },
  { label: '15 minutes', value: '900' },
  { label: '1 hour', value: '3600' },
  { label: '24 hours', value: '86400' },
];

interface SellPositionDialogProps {
  position: PositionBalance;
  onSuccess?: () => void;
  children: React.ReactNode;
}

export default function SellPositionDialog({
  position,
  onSuccess,
  children,
}: SellPositionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const initialBalance = React.useMemo(() => {
    try {
      return formatEther(BigInt(position.balance));
    } catch {
      return '0';
    }
  }, [position.balance]);
  const [tokenAmount, setTokenAmount] = React.useState(initialBalance);
  const [deadlineSeconds, setDeadlineSeconds] = React.useState('900');
  const [error, setError] = React.useState<string | null>(null);

  const { startAuction, isSubmitting } = useSecondaryAuctionStart({
    onSignatureRejected: (err) => setError(err.message),
    onAuctionCreated: () => {
      onSuccess?.();
      router.push('/secondary');
    },
  });

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      try {
        if (!tokenAmount.trim() || !/^\d*\.?\d*$/.test(tokenAmount.trim())) {
          setError('Please enter a valid token amount');
          return;
        }
        const amountWei = parseEther(tokenAmount.trim());

        if (amountWei <= 0n) {
          setError('Token amount must be greater than 0');
          return;
        }
        if (amountWei > BigInt(position.balance)) {
          setError('Amount exceeds your balance');
          return;
        }

        const result = await startAuction({
          token: position.tokenAddress as Address,
          tokenAmount: amountWei,
          deadlineSeconds: Number(deadlineSeconds),
        });

        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Failed to create listing'
        );
      }
    },
    [tokenAmount, deadlineSeconds, position, startAuction]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sell Position</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-foreground -mt-1">
            Buyers will submit offers on your listing and you choose which to
            accept.
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tokenAmount">Amount</Label>
              <button
                type="button"
                className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setTokenAmount(initialBalance);
                  setError(null);
                }}
              >
                Max
              </button>
            </div>
            <Input
              id="tokenAmount"
              type="text"
              value={tokenAmount}
              onChange={(e) => {
                const val = e.target.value;
                setTokenAmount(val);
                setError(null);
                try {
                  if (
                    val.trim() &&
                    /^\d*\.?\d*$/.test(val.trim()) &&
                    parseEther(val.trim()) > BigInt(position.balance)
                  ) {
                    setError('Amount exceeds your balance');
                  }
                } catch {
                  /* ignore parse errors while typing */
                }
              }}
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
            disabled={isSubmitting || !tokenAmount}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing…
              </>
            ) : (
              'Create Listing'
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center -mt-1">
            Listing expires in{' '}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                >
                  {DEADLINE_OPTIONS.find((o) => o.value === deadlineSeconds)
                    ?.label ?? '15 minutes'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="center">
                <div className="flex flex-col gap-1">
                  {DEADLINE_OPTIONS.map((opt) => (
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
