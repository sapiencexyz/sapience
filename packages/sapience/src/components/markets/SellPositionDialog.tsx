'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEther } from 'viem';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi';

import type { PositionType } from '@sapience/ui/types';
import { useAccount } from 'wagmi';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useModifyTrade } from '~/hooks/contract/useModifyTrade';
import { useModifyTradeQuoter } from '~/hooks/contract/useModifyTradeQuoter';

type SellPositionDialogProps = {
  position: PositionType;
  marketAddress: string;
  chainId: number;
  onSuccess?: () => void;
};

export default function SellPositionDialog({
  position,
  marketAddress,
  chainId,
  onSuccess,
}: SellPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const { abi } = useSapienceAbi();
  const { address: accountAddress } = useAccount();

  const positionId = position.positionId;
  const marketGroup = position.market?.marketGroup;
  const collateralSymbol = marketGroup?.collateralSymbol || '';

  // Quote expected proceeds from simulating a close (size -> 0)
  const { quotedCollateralDelta, isQuoting } = useModifyTradeQuoter({
    marketAddress: marketAddress as `0x${string}`,
    marketAbi: abi,
    chainId,
    positionId: BigInt(positionId),
    accountAddress: accountAddress || undefined,
    newSize: BigInt(0),
    enabled:
      !!marketAddress &&
      !!chainId &&
      positionId !== undefined &&
      !!accountAddress,
  });

  // Negative delta means proceeds to user
  const expectedProceeds = useMemo(() => {
    if (quotedCollateralDelta === undefined) return 0;
    return quotedCollateralDelta < BigInt(0)
      ? Number(formatEther(-quotedCollateralDelta))
      : 0;
  }, [quotedCollateralDelta]);

  const {
    closePosition,
    isClosingPosition,
    isLoading,
    isSuccess,
    isError,
    error,
  } = useModifyTrade({
    marketAddress: marketAddress as `0x${string}`,
    marketAbi: abi,
    chainId,
    positionId: BigInt(positionId),
    enabled: !!marketAddress && !!chainId && positionId !== undefined,
  });

  const successHandled = useRef(false);
  useEffect(() => {
    if (isSuccess && !successHandled.current) {
      successHandled.current = true;
      setOpen(false);
      if (onSuccess) onSuccess();
    }
  }, [isSuccess, onSuccess]);

  // Reset success guard whenever dialog opens so future successes can close it
  useEffect(() => {
    if (open) successHandled.current = false;
  }, [open]);

  useEffect(() => {
    if (isError && error) {
      // keep dialog open; errors are toasted by hook
      // no-op
    }
  }, [isError, error]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Sell
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirm Sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              You are about to close this position. Proceeds are estimated and
              may vary due to slippage and fees.
            </div>
            <div className="rounded border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <span>Expected Value</span>
                <span className="font-medium">
                  {isQuoting ? (
                    <span className="inline-flex items-center text-muted-foreground">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Fetching…
                    </span>
                  ) : (
                    <>
                      <NumberDisplay value={expectedProceeds} />{' '}
                      {collateralSymbol}
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isClosingPosition || isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => closePosition()}
                disabled={isClosingPosition || isLoading}
              >
                {isClosingPosition || isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Closing…
                  </>
                ) : (
                  'Confirm Sell'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
