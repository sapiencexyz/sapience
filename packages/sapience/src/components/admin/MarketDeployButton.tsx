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
  claimStatement: string | null; // Moved from nested marketParams
}

// ABI for the createEpoch function (from CreateMarketDialog originally)
const createEpochAbiFragment = [
  {
    type: 'function',
    name: 'createEpoch',
    inputs: [
      { name: 'startTime', type: 'uint256', internalType: 'uint256' },
      { name: 'endTime', type: 'uint256', internalType: 'uint256' },
      { name: 'startingSqrtPriceX96', type: 'uint160', internalType: 'uint160' },
      { name: 'baseAssetMinPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'baseAssetMaxPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'salt', type: 'uint256', internalType: 'uint256' },
      { name: 'claimStatement', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'epochId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Optional: Event ABI item for parsing logs if needed (though marketId is known)
// const epochCreatedEvent = parseAbiItem(
//   'event EpochCreated(uint256 indexed marketId)'
// ) as AbiEvent;

interface MarketDeployButtonProps {
  market: ApiMarket; // Use the adjusted market type
  marketGroupAddress: string; // Added prop
  chainId: number; // Added prop
}

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

const MarketDeployButton: React.FC<MarketDeployButtonProps> = ({ 
  market,
  marketGroupAddress, // Destructure new props
  chainId, // Destructure new props
}) => {
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

  const handleDeployClick = () => {
    setDeployError(null);
    setDeployedTxHash(null);
    resetWriteContract();

    // --- Validation ---
    // Check each required field individually for clarity
    if (!marketGroupAddress) { // Use prop
        setDeployError('Missing market group address.');
        console.error('Missing data: marketGroupAddress', marketGroupAddress);
        return;
    }
    if (market.startTimestamp === null || market.startTimestamp === undefined) {
        setDeployError('Missing start timestamp.');
        console.error('Missing data: startTimestamp', market);
        return;
    }
    if (market.endTimestamp === null || market.endTimestamp === undefined) {
        setDeployError('Missing end timestamp.');
        console.error('Missing data: endTimestamp', market);
        return;
    }
    // Check for null, undefined, AND empty string for string fields
    if (!market.startingSqrtPriceX96) { // Handles null, undefined, ''
        setDeployError('Missing or invalid startingSqrtPriceX96.');
        console.error('Missing data: startingSqrtPriceX96', market);
        return;
    }
    if (market.baseAssetMinPriceTick === null || market.baseAssetMinPriceTick === undefined) {
        setDeployError('Missing base asset minimum price tick.');
        console.error('Missing data: baseAssetMinPriceTick', market);
        return;
    }
    if (market.baseAssetMaxPriceTick === null || market.baseAssetMaxPriceTick === undefined) {
        setDeployError('Missing base asset maximum price tick.');
        console.error('Missing data: baseAssetMaxPriceTick', market);
        return;
    }
    // Check for null, undefined, AND empty string for claim statement (using direct access)
    if (!market.claimStatement) { // Use direct access, removed marketParams
        setDeployError('Missing or invalid claim statement.');
        console.error('Missing data: claimStatement', market);
        return;
    }

    try {
        // Ensure claimStatement is not null/undefined before using toBytes
        const claimStatement = market.claimStatement; // Use direct access
        if (!claimStatement) {
             throw new Error('Claim statement is unexpectedly empty after validation.');
        }
        const claimStatementBytes = toBytes(claimStatement);
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
        console.log('Target contract:', marketGroupAddress); // Use prop

        writeContract({
            address: marketGroupAddress as Address, // Use prop
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
  const isDeployDisabled = isAlreadyDeployed || isWritePending || isConfirming;
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
            Deploy market ID {market.marketId} for group {marketGroupAddress} on chain {chainId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">

          {/* Display Parameters Section - Moved Here */}
          <div className="my-4 p-4 border rounded bg-muted/40">
            <h4 className="font-medium mb-2">Parameters for Contract Call:</h4>
            <div className="text-xs space-y-1 break-all font-mono">
              <p><strong>startTime (uint64):</strong> {market.startTimestamp?.toString() ?? 'N/A'}</p>
              <p><strong>endTime (uint64):</strong> {market.endTimestamp?.toString() ?? 'N/A'}</p>
              <p><strong>startingSqrtPriceX96 (uint160):</strong> {market.startingSqrtPriceX96 ?? 'N/A'}</p>
              <p><strong>baseAssetMinPriceTick (int24):</strong> {market.baseAssetMinPriceTick?.toString() ?? 'N/A'}</p>
              <p><strong>baseAssetMaxPriceTick (int24):</strong> {market.baseAssetMaxPriceTick?.toString() ?? 'N/A'}</p>
              <p><strong>claimStatement (bytes):</strong> {market.claimStatement ?? 'N/A'}</p>
              <p><strong>salt (uint256):</strong> {'<generated on deploy>'}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Note: claimStatement will be converted to bytes. Salt is generated randomly before sending the transaction.</p>
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
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketDeployButton; 