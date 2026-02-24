'use client';

import { useState, useCallback, useMemo } from 'react';
import { formatEther, type Address, type Hex } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import Slider from '@sapience/ui/components/ui/slider';
import { AlertCircle, Flame, Loader2 } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useEscrowWrite } from '~/hooks/blockchain/useEscrowWrite';
import { useEscrowNonce } from '~/hooks/blockchain/useEscrowContract';
import { useSession } from '~/lib/context/SessionContext';
import { useAccount } from 'wagmi';
import {
  buildPredictorBurnTypedData,
  buildCounterpartyBurnTypedData,
} from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';

interface BurnDialogProps {
  pickConfigId: Hex;
  predictorToken: Address;
  counterpartyToken: Address;
  userPredictorBalance: bigint;
  userCounterpartyBalance: bigint;
  totalPredictorCollateral: bigint;
  totalCounterpartyCollateral: bigint;
  chainId: number;
  collateralSymbol: string;
  onBurnComplete?: () => void;
}

/**
 * BurnDialog - Bilateral exit dialog for escrow positions
 *
 * Allows a user who holds both predictor and counterparty tokens
 * (or negotiates with another party) to exit before resolution.
 *
 * Conservation constraint: predictorPayout + counterpartyPayout == totalBurned
 */
export default function BurnDialog({
  pickConfigId,
  predictorToken: _predictorToken,
  counterpartyToken: _counterpartyToken,
  userPredictorBalance,
  userCounterpartyBalance,
  totalPredictorCollateral: _totalPredictorCollateral,
  totalCounterpartyCollateral: _totalCounterpartyCollateral,
  chainId,
  collateralSymbol,
  onBurnComplete,
}: BurnDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User holds both sides - can do bilateral burn with themselves
  const canSelfBurn = userPredictorBalance > 0n && userCounterpartyBalance > 0n;

  // Maximum burnable is the minimum of the two balances
  const maxBurnable = useMemo(() => {
    if (userPredictorBalance <= 0n || userCounterpartyBalance <= 0n) return 0n;
    return userPredictorBalance < userCounterpartyBalance
      ? userPredictorBalance
      : userCounterpartyBalance;
  }, [userPredictorBalance, userCounterpartyBalance]);

  // Burn amounts state
  const [burnPercentage, setBurnPercentage] = useState(100);
  const burnAmount = useMemo(() => {
    return (maxBurnable * BigInt(burnPercentage)) / 100n;
  }, [maxBurnable, burnPercentage]);

  // For self-burn, payout split is 50/50 (user gets back what they burn)
  const predictorPayout = burnAmount;
  const counterpartyPayout = burnAmount;
  const totalPayout = predictorPayout + counterpartyPayout;

  // Hooks
  useAccount();
  const { signTypedData, effectiveAddress } = useSession();
  const { burn, isPending } = useEscrowWrite({ chainId });
  const { nonce: currentNonce } = useEscrowNonce({
    address: effectiveAddress as Address | undefined,
    chainId,
  });

  const verifyingContract = predictionMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const handleBurn = useCallback(async () => {
    if (!effectiveAddress || !verifyingContract || !signTypedData) {
      setError('Wallet not connected or contract not available');
      return;
    }

    if (burnAmount <= 0n) {
      setError('Burn amount must be greater than 0');
      return;
    }

    if (!canSelfBurn) {
      setError(
        'You need to hold both predictor and counterparty tokens to burn'
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const holderAddress = effectiveAddress;
      const nonce = currentNonce ?? 0n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline

      // Build predictor burn typed data
      const predictorTypedData = buildPredictorBurnTypedData({
        pickConfigId,
        predictorTokenAmount: burnAmount,
        counterpartyTokenAmount: burnAmount,
        predictorHolder: holderAddress,
        counterpartyHolder: holderAddress, // Same address for self-burn
        predictorPayout,
        counterpartyPayout,
        predictorNonce: nonce,
        predictorDeadline: deadline,
        verifyingContract,
        chainId,
      });

      // Build counterparty burn typed data (same signer for self-burn)
      const counterpartyTypedData = buildCounterpartyBurnTypedData({
        pickConfigId,
        predictorTokenAmount: burnAmount,
        counterpartyTokenAmount: burnAmount,
        predictorHolder: holderAddress,
        counterpartyHolder: holderAddress,
        predictorPayout,
        counterpartyPayout,
        counterpartyNonce: nonce + 1n, // Different nonce for second signature
        counterpartyDeadline: deadline,
        verifyingContract,
        chainId,
      });

      // Convert domain chainId from bigint to number for signTypedData
      const toSignableTypedData = (data: typeof predictorTypedData) => ({
        ...data,
        domain: {
          ...data.domain,
          chainId: Number(data.domain.chainId),
        },
      });

      // Sign both (user signs twice for self-burn)
      const predictorSignature = await signTypedData(
        toSignableTypedData(predictorTypedData)
      );
      const counterpartySignature = await signTypedData(
        toSignableTypedData(counterpartyTypedData)
      );

      // Execute burn
      const result = await burn({
        burnRequest: {
          pickConfigId,
          predictorTokenAmount: burnAmount,
          counterpartyTokenAmount: burnAmount,
          predictorHolder: holderAddress,
          counterpartyHolder: holderAddress,
          predictorPayout,
          counterpartyPayout,
          predictorNonce: nonce,
          counterpartyNonce: nonce + 1n,
          predictorDeadline: deadline,
          counterpartyDeadline: deadline,
          predictorSignature: predictorSignature,
          counterpartySignature: counterpartySignature,
          refCode:
            '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          predictorSessionKeyData: '0x' as Hex,
          counterpartySessionKeyData: '0x' as Hex,
        },
      });

      if (result.success) {
        setOpen(false);
        onBurnComplete?.();
      } else {
        setError(result.error || 'Burn failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to execute burn');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    effectiveAddress,
    verifyingContract,
    signTypedData,
    burnAmount,
    canSelfBurn,
    currentNonce,
    pickConfigId,
    predictorPayout,
    counterpartyPayout,
    chainId,
    burn,
    onBurnComplete,
  ]);

  const burnAmountFormatted = parseFloat(formatEther(burnAmount));
  const totalPayoutFormatted = parseFloat(formatEther(totalPayout));

  if (!canSelfBurn) {
    return null; // Don't render if user can't burn
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Flame className="w-4 h-4 mr-1" />
          Exit Early
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Bilateral Burn - Early Exit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            You hold both predictor and counterparty tokens for this position.
            You can burn matching amounts to exit before resolution and recover
            your collateral.
          </p>

          {/* Current balances */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Predictor Balance</p>
              <NumberDisplay
                value={parseFloat(formatEther(userPredictorBalance))}
                appendedText={collateralSymbol}
                className="font-medium"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Counterparty Balance
              </p>
              <NumberDisplay
                value={parseFloat(formatEther(userCounterpartyBalance))}
                appendedText={collateralSymbol}
                className="font-medium"
              />
            </div>
          </div>

          {/* Burn amount slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Burn Amount</Label>
              <span className="text-sm text-muted-foreground">
                {burnPercentage}%
              </span>
            </div>
            <Slider
              value={[burnPercentage]}
              onValueChange={(val: number[]) => setBurnPercentage(val[0])}
              min={0}
              max={100}
              step={1}
            />
            <div className="text-center">
              <NumberDisplay
                value={burnAmountFormatted}
                appendedText={`${collateralSymbol} each side`}
                className="text-lg font-semibold"
              />
            </div>
          </div>

          {/* Payout summary */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <p className="text-sm font-medium">Payout Summary</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">You will burn:</div>
              <div className="font-medium text-orange-500">
                <NumberDisplay
                  value={burnAmountFormatted * 2}
                  appendedText={collateralSymbol}
                />
              </div>
              <div className="text-muted-foreground">You will receive:</div>
              <div className="font-medium text-emerald-500">
                <NumberDisplay
                  value={totalPayoutFormatted}
                  appendedText={collateralSymbol}
                />
              </div>
            </div>
          </div>

          {/* Conservation constraint note */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Total payout equals total burned (conservation constraint). For
              self-burn, you receive back what you burn.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleBurn}
            disabled={isSubmitting || isPending || burnAmount <= 0n}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting || isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing & Burning...
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 mr-2" />
                Burn & Exit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
