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
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useChainId,
} from 'wagmi';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';

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

  const {
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
    reset: resetWriteContract,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });
  const { switchChain } = useSwitchChain();
  const currentChainId = useChainId();

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      resetWriteContract();
      setEnableError(null);
      setEnabledTxHash(null);
    }
  }, [isOpen, resetWriteContract]);

  // Effect for confirmation
  useEffect(() => {
    if (isConfirmed && receipt && receipt.transactionHash) {
      setEnabledTxHash(receipt.transactionHash);
      setEnableError(null);
    }
  }, [isConfirmed, receipt]);

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
    resetWriteContract();

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

      if (currentChainId !== group.chainId && switchChain) {
        switchChain({ chainId: group.chainId });
        return;
      }

      writeContract({
        address: bridgeAddress,
        abi: MARKET_LAYER_ZERO_BRIDGE_ABI,
        functionName: 'enableMarketGroup',
        args: [marketGroupAddress],
      });
    } catch (err) {
      console.error('Enable preparation error:', err);
      const message =
        err instanceof Error ? err.message : 'Invalid data provided.';
      setEnableError(`Failed to prepare enable: ${message}`);
    }
  };

  // Determine button state and error display
  const isEnableDisabled = isWritePending || isConfirming;
  const effectiveError =
    enableError || writeError?.message || receiptError?.message;

  const getButtonState = () => {
    if (isConfirming) return { text: 'Confirming...', loading: true };
    if (isWritePending) return { text: 'Sending...', loading: true };
    if (isConfirmed && enabledTxHash)
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
          {hash && !isConfirmed && !receiptError && (
            <Alert variant="default">
              {isConfirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {isConfirming ? 'Confirming Transaction' : 'Transaction Sent'}
              </AlertTitle>
              <AlertDescription>
                Hash: <code className="text-xs break-all">{hash}</code>
                {isConfirming
                  ? ' Waiting for blockchain confirmation...'
                  : ' Sent to network.'}
              </AlertDescription>
            </Alert>
          )}
          {isConfirmed && enabledTxHash && (
            <Alert variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Market Group Enabled!</AlertTitle>
              <AlertDescription>
                Market group {group.address} enabled on bridge. Tx Hash:{' '}
                <code className="text-xs break-all">{enabledTxHash}</code>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnableBridgedMarketGroupButton;
