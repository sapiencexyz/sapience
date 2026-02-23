'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { parseEther, type Address, type Hex } from 'viem';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@sapience/ui/components/ui/card';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { AlertCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@sapience/ui/components/ui/alert';
import type { Pick } from '@sapience/sdk/types/v2';
import { useV2AuctionStart } from '~/hooks/auction/useV2AuctionStart';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import NumberDisplay from '~/components/shared/NumberDisplay';

interface PickFormData {
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: 0 | 1;
}

interface V2CreateAuctionFormProps {
  chainId?: number;
  onAuctionCreated?: (auctionId: string, pickConfigId: Hex) => void;
  defaultConditionResolver?: string;
  defaultConditionId?: string;
}

export default function V2CreateAuctionForm({
  chainId = DEFAULT_CHAIN_ID,
  onAuctionCreated,
  defaultConditionResolver,
  defaultConditionId,
}: V2CreateAuctionFormProps) {
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'USDe';

  // Form state
  const [picks, setPicks] = useState<PickFormData[]>([
    {
      conditionResolver: defaultConditionResolver || '',
      conditionId: defaultConditionId || '',
      predictedOutcome: 0,
    },
  ]);
  const [predictorCollateral, setPredictorCollateral] = useState('');
  const [counterpartyCollateral, setCounterpartyCollateral] = useState('');
  const [deadlineMinutes, setDeadlineMinutes] = useState('5');
  const [error, setError] = useState<string | null>(null);

  // Hooks
  const {
    startAuction,
    isSubmitting,
    isConnected,
    address,
    verifyingContract,
  } = useV2AuctionStart({
    chainId,
    onAuctionCreated,
    onSignatureRejected: (err) =>
      setError(`Signature rejected: ${err.message}`),
  });

  const { balance: collateralBalance } = useCollateralBalance({
    address: address,
    chainId,
  });

  // Add a new pick
  const addPick = useCallback(() => {
    setPicks((prev) => [
      ...prev,
      { conditionResolver: '', conditionId: '', predictedOutcome: 0 },
    ]);
  }, []);

  // Remove a pick
  const removePick = useCallback((index: number) => {
    setPicks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update a pick
  const updatePick = useCallback(
    (index: number, field: keyof PickFormData, value: string | number) => {
      setPicks((prev) =>
        prev.map((pick, i) =>
          i === index ? { ...pick, [field]: value } : pick
        )
      );
    },
    []
  );

  // Validate form
  const validateForm = useCallback((): string | null => {
    if (!isConnected) {
      return 'Please connect your wallet';
    }

    if (!verifyingContract) {
      return 'V2 contract not available on this chain';
    }

    if (picks.length === 0) {
      return 'At least one pick is required';
    }

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      if (
        !pick.conditionResolver ||
        !/^0x[a-fA-F0-9]{40}$/.test(pick.conditionResolver)
      ) {
        return `Pick ${i + 1}: Invalid condition resolver address`;
      }
      if (!pick.conditionId || !/^0x[a-fA-F0-9]{64}$/.test(pick.conditionId)) {
        return `Pick ${i + 1}: Invalid condition ID (must be 32-byte hex)`;
      }
    }

    const predictorCollateralNum = parseFloat(predictorCollateral);
    if (!predictorCollateral || isNaN(predictorCollateralNum) || predictorCollateralNum <= 0) {
      return 'Please enter a valid predictor collateral';
    }

    if (predictorCollateralNum > collateralBalance) {
      return `Insufficient balance. You have ${collateralBalance.toFixed(2)} ${collateralSymbol}`;
    }

    const counterpartyCollateralNum = parseFloat(counterpartyCollateral);
    if (
      !counterpartyCollateral ||
      isNaN(counterpartyCollateralNum) ||
      counterpartyCollateralNum <= 0
    ) {
      return 'Please enter a valid counterparty collateral';
    }

    return null;
  }, [
    isConnected,
    verifyingContract,
    picks,
    predictorCollateral,
    counterpartyCollateral,
    collateralBalance,
    collateralSymbol,
  ]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        // Convert picks to SDK format
        const sdkPicks: Pick[] = picks.map((p) => ({
          conditionResolver: p.conditionResolver as Address,
          conditionId: p.conditionId as Hex,
          predictedOutcome: p.predictedOutcome,
        }));

        const result = await startAuction({
          picks: sdkPicks,
          predictorCollateral: parseEther(predictorCollateral),
          counterpartyCollateral: parseEther(counterpartyCollateral),
          deadlineSeconds: parseInt(deadlineMinutes) * 60,
        });

        if (!result.success) {
          setError(result.error || 'Failed to create auction');
        }
      } catch (err: any) {
        setError(err?.message || 'An error occurred');
      }
    },
    [
      picks,
      predictorCollateral,
      counterpartyCollateral,
      deadlineMinutes,
      validateForm,
      startAuction,
    ]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create V2 Prediction</CardTitle>
        <CardDescription>
          Create a new prediction auction. Counterparties can bid to fill your
          prediction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Picks section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Picks</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPick}
                disabled={picks.length >= 5}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Pick
              </Button>
            </div>

            {picks.map((pick, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg space-y-3 bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Pick {index + 1}</Badge>
                  {picks.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePick(index)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`resolver-${index}`}>
                      Condition Resolver
                    </Label>
                    <Input
                      id={`resolver-${index}`}
                      placeholder="0x..."
                      value={pick.conditionResolver}
                      onChange={(e) =>
                        updatePick(index, 'conditionResolver', e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`conditionId-${index}`}>Condition ID</Label>
                    <Input
                      id={`conditionId-${index}`}
                      placeholder="0x..."
                      value={pick.conditionId}
                      onChange={(e) =>
                        updatePick(index, 'conditionId', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Predicted Outcome</Label>
                  <Select
                    value={String(pick.predictedOutcome)}
                    onValueChange={(v) =>
                      updatePick(index, 'predictedOutcome', parseInt(v))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">
                        <span className="text-emerald-500 font-medium">
                          YES
                        </span>
                      </SelectItem>
                      <SelectItem value="1">
                        <span className="text-red-500 font-medium">NO</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>

          {/* Collateral inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="predictorCollateral">
                Your Collateral ({collateralSymbol})
              </Label>
              <Input
                id="predictorCollateral"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={predictorCollateral}
                onChange={(e) => setPredictorCollateral(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Balance:{' '}
                <NumberDisplay
                  value={collateralBalance}
                  appendedText={collateralSymbol}
                />
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="counterpartyCollateral">
                Counterparty Collateral ({collateralSymbol})
              </Label>
              <Input
                id="counterpartyCollateral"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={counterpartyCollateral}
                onChange={(e) => setCounterpartyCollateral(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is what counterparties must stake to fill your prediction
              </p>
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="deadline">Auction Deadline</Label>
            <Select value={deadlineMinutes} onValueChange={setDeadlineMinutes}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Summary */}
          {predictorCollateral && counterpartyCollateral && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm font-medium">Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div>Total Pool:</div>
                <div className="font-medium text-foreground">
                  <NumberDisplay
                    value={
                      parseFloat(predictorCollateral || '0') +
                      parseFloat(counterpartyCollateral || '0')
                    }
                    appendedText={collateralSymbol}
                  />
                </div>
                <div>If you win:</div>
                <div className="font-medium text-emerald-500">
                  +
                  <NumberDisplay
                    value={parseFloat(counterpartyCollateral || '0')}
                    appendedText={collateralSymbol}
                  />
                </div>
                <div>If you lose:</div>
                <div className="font-medium text-red-500">
                  -
                  <NumberDisplay
                    value={parseFloat(predictorCollateral || '0')}
                    appendedText={collateralSymbol}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !isConnected}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Auction...
              </>
            ) : !isConnected ? (
              'Connect Wallet'
            ) : (
              'Create Prediction Auction'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
