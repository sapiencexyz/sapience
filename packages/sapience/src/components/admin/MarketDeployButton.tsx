'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import type { MarketType } from '@foil/ui/types';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toBytes, bytesToHex } from 'viem';
import type { Address } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

// ABI for the createEpoch function (from CreateMarketDialog originally)
const createEpochAbiFragment = [
  {
    type: 'function',
    name: 'createEpoch',
    inputs: [
      { name: 'startTime', type: 'uint256', internalType: 'uint256' },
      { name: 'endTime', type: 'uint256', internalType: 'uint256' },
      {
        name: 'startingSqrtPriceX96',
        type: 'uint160',
        internalType: 'uint160',
      },
      { name: 'baseAssetMinPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'baseAssetMaxPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'salt', type: 'uint256', internalType: 'uint256' },
      { name: 'claimStatement', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'epochId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface MarketDeployButtonProps {
  market: MarketType; // Use the adjusted market type
  marketGroupAddress: string; // Added prop
  chainId: number; // Added prop
}

const MarketDeployButton: React.FC<MarketDeployButtonProps> = ({
  market,
  marketGroupAddress, // Destructure new props
  chainId, // Destructure new props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedTxHash, setDeployedTxHash] = useState<string | null>(null);

  const {
    // Wagmi hooks for contract interaction
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
    reset: resetWriteContract,
  } = useWriteContract();

  const {
    // Wagmi hook for transaction receipt
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      resetWriteContract();
      setDeployError(null);
      setDeployedTxHash(null);
    }
  }, [isOpen, resetWriteContract]);

  // Simplified Effect for confirmation
  useEffect(() => {
    // Only run if confirmed and receipt exists
    if (isConfirmed && receipt && receipt.transactionHash) {
      setDeployedTxHash(receipt.transactionHash);
      setDeployError(null);
    }
  }, [isConfirmed, receipt]);

  // Validate market data and return error message if invalid
  const validateMarketData = () => {
    if (!marketGroupAddress) {
      return 'Missing market group address.';
    }
    if (market.startTimestamp === null || market.startTimestamp === undefined) {
      return 'Missing start timestamp.';
    }
    if (market.endTimestamp === null || market.endTimestamp === undefined) {
      return 'Missing end timestamp.';
    }
    if (!market.startingSqrtPriceX96) {
      return 'Missing or invalid startingSqrtPriceX96.';
    }
    if (
      market.baseAssetMinPriceTick === null ||
      market.baseAssetMinPriceTick === undefined
    ) {
      return 'Missing base asset minimum price tick.';
    }
    if (
      market.baseAssetMaxPriceTick === null ||
      market.baseAssetMaxPriceTick === undefined
    ) {
      return 'Missing base asset maximum price tick.';
    }
    if (!market.marketParamsClaimstatement) {
      return 'Missing or invalid claim statement.';
    }
    return null;
  };

  const handleDeployClick = () => {
    setDeployError(null);
    setDeployedTxHash(null);
    resetWriteContract();

    // Validate market data
    const validationError = validateMarketData();
    if (validationError) {
      setDeployError(validationError);
      console.error('Validation error:', validationError, market);
      return;
    }

    try {
      const claimStatement = market.marketParamsClaimstatement;
      const claimStatementBytes = toBytes(claimStatement as string);
      const claimStatementHex = bytesToHex(claimStatementBytes);

      // Ensure numeric values are correctly typed for BigInt/Number conversion
      const startTimeNum = Number(market.startTimestamp);
      const endTimeNum = Number(market.endTimestamp);
      const minPriceTickNum = Number(market.baseAssetMinPriceTick);
      const maxPriceTickNum = Number(market.baseAssetMaxPriceTick);

      if (
        Number.isNaN(startTimeNum) ||
        Number.isNaN(endTimeNum) ||
        Number.isNaN(minPriceTickNum) ||
        Number.isNaN(maxPriceTickNum)
      ) {
        throw new Error('Invalid numeric value found in market data.');
      }

      // Generate salt on the fly
      const salt = BigInt(Math.floor(Math.random() * 1e18));

      const args = [
        BigInt(startTimeNum),
        BigInt(endTimeNum),
        BigInt(market.startingSqrtPriceX96!),
        minPriceTickNum,
        maxPriceTickNum,
        salt,
        claimStatementHex as `0x${string}`,
      ] as const;

      console.log('Calling writeContract (createEpoch) with args:', args);
      console.log('Target contract:', marketGroupAddress);

      writeContract({
        address: marketGroupAddress as Address,
        abi: createEpochAbiFragment,
        functionName: 'createEpoch',
        args,
      });
    } catch (err) {
      console.error('Deployment preparation error:', err);
      const message =
        err instanceof Error ? err.message : 'Invalid data provided.';
      setDeployError(`Failed to prepare deployment: ${message}`);
    }
  };

  // Determine button state and error display
  const isAlreadyDeployed = !!market.poolAddress;
  const isDeployDisabled = isAlreadyDeployed || isWritePending || isConfirming;
  const effectiveError =
    deployError || writeError?.message || receiptError?.message;

  const getButtonState = () => {
    if (isConfirming) return { text: 'Confirming...', loading: true };
    if (isWritePending) return { text: 'Sending...', loading: true };
    if (isConfirmed && deployedTxHash)
      return { text: 'Deployed', loading: false, success: true };
    if (isAlreadyDeployed)
      return { text: 'Already Deployed', loading: false, success: true }; // Handle already deployed case
    return { text: 'Deploy', loading: false };
  };

  const {
    text: buttonText,
    loading: buttonLoading,
    success: buttonSuccess,
  } = getButtonState();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={isAlreadyDeployed ? 'outline' : 'secondary'} // Different style if deployed
          disabled={isAlreadyDeployed} // Disable trigger if already deployed
        >
          {isAlreadyDeployed ? 'Deployed' : 'Deploy'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Deploy Market (Epoch)</DialogTitle>
          <DialogDescription>
            Deploy market ID {market.marketId} for group {marketGroupAddress} on
            chain {chainId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Display Parameters Section - Moved Here */}
          <div className="my-4 p-4 border rounded bg-muted/40">
            <h4 className="font-medium mb-2">Parameters for Contract Call:</h4>
            <div className="text-xs space-y-1 break-all font-mono">
              <p>
                <strong>startTime (uint64):</strong>{' '}
                {market.startTimestamp?.toString() ?? 'N/A'}
              </p>
              <p>
                <strong>endTime (uint64):</strong>{' '}
                {market.endTimestamp?.toString() ?? 'N/A'}
              </p>
              <p>
                <strong>startingSqrtPriceX96 (uint160):</strong>{' '}
                {market.startingSqrtPriceX96 ?? 'N/A'}
              </p>
              <p>
                <strong>baseAssetMinPriceTick (int24):</strong>{' '}
                {market.baseAssetMinPriceTick?.toString() ?? 'N/A'}
              </p>
              <p>
                <strong>baseAssetMaxPriceTick (int24):</strong>{' '}
                {market.baseAssetMaxPriceTick?.toString() ?? 'N/A'}
              </p>
              <p>
                <strong>claimStatement (bytes):</strong>{' '}
                {market.marketParamsClaimstatement ?? 'N/A'}
              </p>
              <p>
                <strong>salt (uint256):</strong> {'<generated on deploy>'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Note: claimStatement will be converted to bytes. Salt is generated
              randomly before sending the transaction.
            </p>
          </div>

          {/* Deploy Button inside Dialog */}
          <Button
            onClick={handleDeployClick}
            disabled={isDeployDisabled || buttonSuccess} // Disable if pending, confirmed, or already deployed
            className="w-full"
          >
            {buttonLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonText}
          </Button>

          {/* Status/Error Display */}
          {effectiveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Deployment Error</AlertTitle>
              <AlertDescription>{effectiveError}</AlertDescription>
            </Alert>
          )}
          {hash &&
            !isConfirmed &&
            !receiptError && ( // Show pending state
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
          {isConfirmed &&
            deployedTxHash && ( // Show success state
              <Alert variant="default">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Deployment Successful!</AlertTitle>
                <AlertDescription>
                  Market {market.marketId} deployed. Tx Hash:{' '}
                  <code className="text-xs break-all">{deployedTxHash}</code>
                </AlertDescription>
              </Alert>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketDeployButton;
