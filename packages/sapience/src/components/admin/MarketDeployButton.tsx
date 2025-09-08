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
import { sapienceAbi } from '@sapience/ui/lib/abi';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { bytesToHex, toBytes } from 'viem';

import type { MarketType } from '@sapience/ui/types';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

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
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContract, isPending, reset } = useSapienceWriteContract({
    onSuccess: (receipt: unknown) => {
      if (
        receipt &&
        typeof receipt === 'object' &&
        'transactionHash' in receipt
      ) {
        const txReceipt = receipt as { transactionHash: string };
        setTxHash(txReceipt.transactionHash);
        setDeployError(null);
      }
    },
    onError: (error) => {
      setDeployError(error.message);
    },
    onTxHash: (hash) => {
      setTxHash(hash);
    },
    successMessage: 'Market deployment submission was successful',
    fallbackErrorMessage: 'Failed to deploy market',
  });

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      reset();
      setDeployError(null);
      setTxHash(null);
    }
  }, [isOpen, reset]);

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
    if (!market.claimStatementYesOrNumeric) {
      return 'Missing or invalid claim statement Yes or Numeric.';
    }
    // claimStatementNo is optional, so no validation needed
    return null;
  };

  const handleDeployClick = async () => {
    setDeployError(null);
    setTxHash(null);
    reset();

    // Validate market data
    const validationError = validateMarketData();
    if (validationError) {
      setDeployError(validationError);
      console.error('Validation error:', validationError, market);
      return;
    }

    try {
      const claimStatementYesOrNumeric = market.claimStatementYesOrNumeric;
      const claimStatementNo = market.claimStatementNo || ''; // Default to empty string if undefined
      const claimStatementBytesYesOrNumeric = toBytes(
        claimStatementYesOrNumeric as string
      );
      const claimStatementHexYesOrNumeric = bytesToHex(
        claimStatementBytesYesOrNumeric
      );

      const claimStatementBytesNo = toBytes(claimStatementNo);
      const claimStatementHexNo = bytesToHex(claimStatementBytesNo);

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

      // Create MarketCreationParams struct
      const args = {
        startTime: BigInt(startTimeNum),
        endTime: BigInt(endTimeNum),
        startingSqrtPriceX96: BigInt(market.startingSqrtPriceX96 ?? '0'),
        baseAssetMinPriceTick: minPriceTickNum,
        baseAssetMaxPriceTick: maxPriceTickNum,
        salt,
        claimStatementYesOrNumeric: claimStatementHexYesOrNumeric,
        claimStatementNo: claimStatementHexNo,
      };

      console.log('Calling writeContract (createMarket) with args:', args);
      console.log('Target contract:', marketGroupAddress);

      await writeContract({
        chainId,
        address: marketGroupAddress as Address,
        abi: sapienceAbi().abi,
        functionName: 'createMarket',
        args: [args],
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
  const isDeployDisabled = isAlreadyDeployed || isPending;
  const effectiveError = deployError;

  const getButtonState = () => {
    if (isPending) return { text: 'Deploying...', loading: true };
    if (txHash) return { text: 'Deployed', loading: false, success: true };
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
          <DialogTitle>Deploy Market</DialogTitle>
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
                <strong>claimStatement Yes (bytes):</strong>{' '}
                {market.claimStatementYesOrNumeric ?? 'N/A'}
              </p>
              <p>
                <strong>claimStatement No (bytes):</strong>{' '}
                {market.claimStatementNo ?? 'N/A'}
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
          {txHash && !buttonSuccess && (
            <Alert variant="default">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Transaction Sent</AlertTitle>
              <AlertDescription>
                Hash: <code className="text-xs break-all">{txHash}</code>
                {' Waiting for blockchain confirmation...'}
              </AlertDescription>
            </Alert>
          )}
          {txHash && buttonSuccess && (
            <Alert variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Deployment Successful!</AlertTitle>
              <AlertDescription>
                Market {market.marketId} deployed. Tx Hash:{' '}
                <code className="text-xs break-all">{txHash}</code>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketDeployButton;
