'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { parseAbiItem, decodeEventLog, toBytes, bytesToHex } from 'viem';
import type { Address, AbiEvent } from 'viem';
import { useMutation } from '@tanstack/react-query'; // For potential PATCH call

// Assuming Market type is defined elsewhere, e.g., fetched from API
// We need properties like: id, marketId, marketGroup.address, marketGroup.chainId,
// startTimestamp, endTimestamp, startingSqrtPriceX96, baseAssetMinPriceTick,
// baseAssetMaxPriceTick, claimStatement, salt, poolAddress (to check if deployed)

// Placeholder type - adjust according to actual API response structure
interface ApiMarket {
  id: number;
  marketId: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
  startingSqrtPriceX96: string | null;
  baseAssetMinPriceTick: number | null;
  baseAssetMaxPriceTick: number | null;
  poolAddress: string | null; // Indicates if already deployed
  marketGroup: {
    address: string;
    chainId: number;
  };
  marketParams: {
    claimStatement: string | null;
  } | null;
}

// ABI for the createEpoch function (from CreateMarketDialog originally)
const createEpochAbiFragment = [
  {
    type: 'function',
    name: 'createEpoch',
    inputs: [
      { name: 'startTime', type: 'uint64', internalType: 'uint64' },
      { name: 'endTime', type: 'uint64', internalType: 'uint64' },
      { name: 'startingSqrtPriceX96', type: 'uint160', internalType: 'uint160' },
      { name: 'baseAssetMinPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'baseAssetMaxPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'salt', type: 'uint256', internalType: 'uint256' },
      { name: 'claimStatement', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'marketId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Optional: Event ABI item for parsing logs if needed (though marketId is known)
// const epochCreatedEvent = parseAbiItem(
//   'event EpochCreated(uint256 indexed marketId)'
// ) as AbiEvent;

interface MarketDeployButtonProps {
  market: ApiMarket; // Use the defined market type
}

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

const MarketDeployButton: React.FC<MarketDeployButtonProps> = ({ market }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedTxHash, setDeployedTxHash] = useState<string | null>(null);

  const { // Wagmi hooks for contract interaction
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
    reset: resetWriteContract,
  } = useWriteContract();

  const { // Wagmi hook for transaction receipt
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Optional: Mutation to PATCH the market status on successful deployment
  const updateMarketMutation = useMutation({
    mutationFn: async (payload: { deploymentTxHash: string; poolAddress?: string }) => {
        // TODO: Implement API PATCH call
        // const response = await fetch(`${API_BASE_URL}/markets/${market.id}`, {
        //   method: 'PATCH',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(payload),
        // });
        // if (!response.ok) {
        //   const errorData = await response.json();
        //   throw new Error(errorData.message || 'Failed to update market status');
        // }
        // return response.json();
        console.log('Simulating PATCH call with payload:', payload);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        return { success: true, marketId: market.marketId, txHash: payload.deploymentTxHash }; // Simulate successful response
    },
    onSuccess: (data) => {
      console.log('Market status updated successfully:', data);
      // Optionally invalidate query cache for markets here
    },
    onError: (error: Error) => {
      console.error('Failed to update market status:', error);
      // Display this error? Maybe add a separate alert state for API update errors
      setDeployError(`Deployment succeeded, but failed to update status: ${error.message}`);
    },
  });

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      resetWriteContract();
      setDeployError(null);
      setDeployedTxHash(null);
      updateMarketMutation.reset();
    }
  }, [isOpen, resetWriteContract, updateMarketMutation]);

  // Effect to trigger PATCH call on confirmation
  useEffect(() => {
    if (isConfirmed && receipt && receipt.transactionHash) {
        setDeployedTxHash(receipt.transactionHash);
        setDeployError(null); // Clear previous errors on confirmation
        // TODO: Potentially derive poolAddress from logs if needed/possible
        // or fetch it separately after confirmation
        updateMarketMutation.mutate({ deploymentTxHash: receipt.transactionHash });
    }
  }, [isConfirmed, receipt, market.id, updateMarketMutation]); // Add dependencies

  const handleDeployClick = () => {
    setDeployError(null);
    setDeployedTxHash(null);
    resetWriteContract();
    updateMarketMutation.reset();

    // --- Validation ---
    if (
        !market.marketGroup?.address ||
        market.startTimestamp === null || market.startTimestamp === undefined ||
        market.endTimestamp === null || market.endTimestamp === undefined ||
        !market.startingSqrtPriceX96 ||
        market.baseAssetMinPriceTick === null || market.baseAssetMinPriceTick === undefined ||
        market.baseAssetMaxPriceTick === null || market.baseAssetMaxPriceTick === undefined ||
        !market.marketParams?.claimStatement
    ) {
        setDeployError('Missing required market data for deployment.');
        console.error('Missing data:', market);
        return;
    }

    try {
        const claimStatementBytes = toBytes(market.marketParams.claimStatement!);
        const claimStatementHex = bytesToHex(claimStatementBytes);

        // Ensure numeric values are correctly typed for BigInt/Number conversion
        const startTimeNum = Number(market.startTimestamp);
        const endTimeNum = Number(market.endTimestamp);
        const minPriceTickNum = Number(market.baseAssetMinPriceTick);
        const maxPriceTickNum = Number(market.baseAssetMaxPriceTick);

        if (isNaN(startTimeNum) || isNaN(endTimeNum) || isNaN(minPriceTickNum) || isNaN(maxPriceTickNum)) {
            throw new Error('Invalid numeric value found in market data.');
        }

        // Generate salt on the fly (using Math.random for simplicity, consider crypto for better randomness if available/needed)
        const salt = BigInt(Math.floor(Math.random() * 1e18)); // Generate a large random BigInt

        const args = [
            BigInt(startTimeNum),
            BigInt(endTimeNum),
            BigInt(market.startingSqrtPriceX96),
            minPriceTickNum,
            maxPriceTickNum,
            salt, // Use the newly generated salt
            claimStatementHex as `0x${string}`,
        ] as const;

        console.log('Calling writeContract (createEpoch) with args:', args);
        console.log('Target contract:', market.marketGroup.address);

        writeContract({
            address: market.marketGroup.address as Address,
            abi: createEpochAbiFragment,
            functionName: 'createEpoch',
            args,
        });

    } catch (err: any) {
      console.error('Deployment preparation error:', err);
      setDeployError(`Failed to prepare deployment: ${err.message || 'Invalid data provided.'}`);
    }
  };

  // Determine button state and error display
  const isAlreadyDeployed = !!market.poolAddress;
  const isDeployDisabled = isAlreadyDeployed || isWritePending || isConfirming || updateMarketMutation.isPending;
  const effectiveError = deployError || writeError?.message || receiptError?.message;

  const getButtonState = () => {
    if (isConfirming) return { text: 'Confirming...', loading: true };
    if (isWritePending) return { text: 'Sending...', loading: true };
    if (isConfirmed && deployedTxHash) return { text: 'Deployed', loading: false, success: true };
    if (isAlreadyDeployed) return { text: 'Already Deployed', loading: false, success: true }; // Handle already deployed case
    return { text: 'Deploy', loading: false };
  };

  const { text: buttonText, loading: buttonLoading, success: buttonSuccess } = getButtonState();

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
            Deploy market ID {market.marketId} for group {market.marketGroup?.address}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Display key parameters */} 
          <div className="text-sm text-muted-foreground space-y-1 break-all">
            <p><strong>Market ID:</strong> {market.marketId}</p>
            <p><strong>Start Time:</strong> {market.startTimestamp}</p>
            <p><strong>End Time:</strong> {market.endTimestamp}</p>
            <p><strong>Claim:</strong> {market.marketParams?.claimStatement || 'N/A'}</p>
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
          {hash && !isConfirmed && !receiptError && ( // Show pending state
             <Alert variant="default">
              {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              <AlertTitle>{isConfirming ? 'Confirming Transaction' : 'Transaction Sent'}</AlertTitle>
              <AlertDescription>
                 Hash: <code className="text-xs break-all">{hash}</code>
                 {isConfirming ? ' Waiting for blockchain confirmation...' : ' Sent to network.'}
              </AlertDescription>
            </Alert>
          )}
          {isConfirmed && deployedTxHash && ( // Show success state
            <Alert variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Deployment Successful!</AlertTitle>
              <AlertDescription>
                Market {market.marketId} deployed. Tx Hash:{' '}
                <code className="text-xs break-all">{deployedTxHash}</code>
                {updateMarketMutation.isPending && ' (Updating status...)'}
                {updateMarketMutation.isSuccess && ' (Status updated)'}
              </AlertDescription>
            </Alert>
          )}
           {/* Optional: Show API update error separately if needed */}
           {updateMarketMutation.isError && (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Status Update Issue</AlertTitle>
                <AlertDescription>{(updateMarketMutation.error as Error)?.message || 'Failed to update market status in DB.'}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketDeployButton; 