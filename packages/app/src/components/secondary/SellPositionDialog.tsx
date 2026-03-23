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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import { Loader2, CheckCircle } from 'lucide-react';
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
  const [listed, setListed] = React.useState(false);
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
      setListed(true);
      onSuccess?.();
    },
  });

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setListed(false);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {listed ? 'Listed for Sale' : 'Sell Position Tokens'}
          </DialogTitle>
        </DialogHeader>

        {listed ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span>Your position is now listed on the secondary market.</span>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false);
                router.push('/secondary');
              }}
            >
              View on Secondary Market
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tokenAmount">Token Amount</Label>
              <Input
                id="tokenAmount"
                type="text"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="0.0"
              />
              <p className="text-xs text-muted-foreground">
                Balance: {initialBalance}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Select
                value={deadlineSeconds}
                onValueChange={setDeadlineSeconds}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                'List for Sale'
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
