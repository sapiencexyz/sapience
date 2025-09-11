'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@sapience/ui/components/ui/alert';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Address } from 'viem';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

interface EnableBridgedMarketGroupButtonProps {
  group: EnrichedMarketGroup;
}

// ABI for the MarketLayerZeroBridge contract
// This is a minimal ABI for the enableMarketGroup function
const MARKET_LAYER_ZERO_BRIDGE_ABI = [
  {
    type: 'function',
    name: 'enableMarketGroup',
    inputs: [
      {
        name: 'marketGroupAddress',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// No hardcoded bridge address - it comes from group.marketParamsOptimisticoraclev3

const EnableBridgedMarketGroupButton: React.FC<
  EnableBridgedMarketGroupButtonProps
> = ({ group }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enabledTxHash, setEnabledTxHash] = useState<string | null>(null);

  // Use useSapienceWriteContract for transaction handling
  const {
    writeContract,
    isPending: isWritePending,
    reset,
  } = useSapienceWriteContract({
    onSuccess: () => {
      // Transaction completed successfully
    },
    onError: (error: Error) => {
      console.error('Enable error:', error);
      setEnableError(error.message);
    },
    onTxHash: (hash) => {
      setEnabledTxHash(hash);
      setEnableError(null);
    },
    successMessage: 'Market group enable submission was successful',
    fallbackErrorMessage: 'Failed to enable market group',
  });

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      reset();
      setEnableError(null);
      setEnabledTxHash(null);
    }
  }, [isOpen, reset]);

  // Validate group data and return error message if invalid
  const validateGroupData = () => {
    if (!group.address) {
      return 'Missing market group address.';
    }
    if (!group.isBridged) {
      return 'Market group is not bridged.';
    }
    if (!group.marketParamsOptimisticoraclev3) {
      return 'Missing bridge address (optimisticOracleV3).';
    }
    return null;
  };

  const handleEnableClick = () => {
    setEnableError(null);
    setEnabledTxHash(null);
    reset();

    // Validate group data
    const validationError = validateGroupData();
    if (validationError) {
      setEnableError(validationError);
      console.error('Validation error:', validationError, group);
      return;
    }

    try {
      const bridgeAddress = group.marketParamsOptimisticoraclev3 as Address;
      const marketGroupAddress = group.address as Address;

      console.log('Calling writeContract (enableMarketGroup) with args:', [
        marketGroupAddress,
      ]);
      console.log('Target bridge contract:', bridgeAddress);

      writeContract({
        address: bridgeAddress,
        abi: MARKET_LAYER_ZERO_BRIDGE_ABI,
        functionName: 'enableMarketGroup',
        args: [marketGroupAddress],
        chainId: group.chainId,
      });
    } catch (err) {
      console.error('Enable preparation error:', err);
      const message =
        err instanceof Error ? err.message : 'Invalid data provided.';
      setEnableError(`Failed to prepare enable: ${message}`);
    }
  };

  // Determine button state and error display
  const isEnableDisabled = isWritePending;
  const effectiveError = enableError;

  const getButtonState = () => {
    if (isWritePending) return { text: 'Enabling...', loading: true };
    if (enabledTxHash)
      return { text: 'Enabled', loading: false, success: true };
    return { text: 'Enable', loading: false };
  };

  const {
    text: buttonText,
    loading: buttonLoading,
    success: buttonSuccess,
  } = getButtonState();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Enable</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enable Bridged Market Group</DialogTitle>
          <DialogDescription>
            Enable market group {group.address} on bridge{' '}
            {group.marketParamsOptimisticoraclev3} on chain {group.chainId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Display Parameters Section */}
          <div className="my-4 p-4 border rounded bg-muted/40">
            <h4 className="font-medium mb-2">Parameters for Contract Call:</h4>
            <div className="text-xs space-y-1 break-all font-mono">
              <p>
                <strong>Bridge Address:</strong>{' '}
                {group.marketParamsOptimisticoraclev3 ?? 'N/A'}
              </p>
              <p>
                <strong>Market Group Address:</strong> {group.address ?? 'N/A'}
              </p>
              <p>
                <strong>Chain ID:</strong> {group.chainId}
              </p>
              <p>
                <strong>Is Bridged:</strong> {group.isBridged ? 'Yes' : 'No'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This will call enableMarketGroup(marketGroupAddress) on the
              MarketLayerZeroBridge contract.
            </p>
          </div>

          {/* Enable Button inside Dialog */}
          <Button
            onClick={handleEnableClick}
            disabled={isEnableDisabled || buttonSuccess}
            className="w-full"
          >
            {buttonLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonText}
          </Button>

          {/* Status/Error Display */}
          {effectiveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Enable Error</AlertTitle>
              <AlertDescription>{effectiveError}</AlertDescription>
            </Alert>
          )}
          {enabledTxHash && !isWritePending && (
            <Alert variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Market Group Enabled!</AlertTitle>
              <AlertDescription>
                Market group {group.address} enabled on bridge. Tx Hash:{' '}
                <code className="text-xs break-all">{enabledTxHash}</code>
              </AlertDescription>
            </Alert>
          )}
          {enabledTxHash && isWritePending && (
            <Alert variant="default">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Confirming Transaction</AlertTitle>
              <AlertDescription>
                Hash: <code className="text-xs break-all">{enabledTxHash}</code>{' '}
                Waiting for blockchain confirmation...
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnableBridgedMarketGroupButton;
