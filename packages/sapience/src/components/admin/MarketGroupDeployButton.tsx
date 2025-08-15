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
import { sapienceFactoryAbi } from '@sapience/ui/lib/abi';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AbiEvent, Address } from 'viem';
import { decodeEventLog, parseAbiItem } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useSwitchChain,
  useChainId,
} from 'wagmi';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';

// Event ABI item for parsing logs (from MarketGroupFactory)
const marketGroupDeployedEvent = parseAbiItem(
  'event MarketGroupDeployed(address indexed sender, address indexed marketGroup, uint256 nonce)'
) as AbiEvent;

interface MarketGroupDeployButtonProps {
  group: EnrichedMarketGroup; // Use the full enriched type
}

const MarketGroupDeployButton: React.FC<MarketGroupDeployButtonProps> = ({
  group,
}) => {
  const [isOpen, setIsOpen] = useState(false); // Control dialog open state
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null);
  const ICON_SIZE = 'h-4 w-4'; // Define constant for icon size classes
  const NOT_AVAILABLE = 'Not available'; // Constant for unavailable data

  const {
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
    reset: resetWriteContract, // Function to reset write state
  } = useWriteContract();
  const { switchChain } = useSwitchChain();
  const currentChainId = useChainId();

  const {
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
      setDeployedAddress(null);
    }
  }, [isOpen, resetWriteContract]);

  // Effect to parse logs on confirmation
  useEffect(() => {
    if (isConfirmed && receipt) {
      try {
        const logs = receipt.logs
          .map((log) => {
            try {
              // Ensure topics is an array and create a mutable copy
              const safeTopics = Array.isArray(log.topics)
                ? [...log.topics] // Create a mutable copy
                : [];
              // Cast to the specific mutable tuple type expected by decodeEventLog
              const typedTopics = safeTopics as
                | []
                | [`0x${string}`, ...`0x${string}`[]];
              return decodeEventLog({
                abi: [marketGroupDeployedEvent],
                data: log.data,
                topics: typedTopics,
              });
            } catch {
              return null;
            }
          })
          .filter(
            (decodedLog) =>
              decodedLog !== null &&
              decodedLog.eventName === 'MarketGroupDeployed'
          );

        if (logs.length > 0 && logs[0]?.args && 'marketGroup' in logs[0].args) {
          setDeployedAddress(logs[0].args.marketGroup as Address);
          setDeployError(null);
          // TODO: Optionally call PATCH endpoint here
          // invalidate query cache
        } else {
          console.warn(
            'MarketGroupDeployed event not found in transaction logs.',
            receipt
          );
          setDeployError(
            'Deployment transaction confirmed, but event emission was not detected.'
          );
        }
      } catch (e) {
        console.error('Error processing deployment logs:', e);
        setDeployError('Error processing deployment transaction logs.');
      }
    }
  }, [isConfirmed, receipt]);

  const handleDeployClick = () => {
    setDeployError(null);
    setDeployedAddress(null);
    resetWriteContract(); // Reset previous states
    // --- Validation ---
    if (
      !group.factoryAddress ||
      !group.initializationNonce ||
      !group.collateralAsset ||
      !group.minTradeSize ||
      !group.marketParamsFeerate ||
      !group.marketParamsAssertionliveness ||
      !group.marketParamsBondamount ||
      !group.marketParamsBondcurrency ||
      !group.marketParamsUniswappositionmanager ||
      !group.marketParamsUniswapswaprouter ||
      !group.marketParamsUniswapquoter ||
      !group.marketParamsOptimisticoraclev3
    ) {
      setDeployError('Missing required market group data for deployment.');
      return;
    }

    try {
      // Reconstruct marketParams from flattened properties
      const marketParams = {
        feeRate: group.marketParamsFeerate,
        assertionLiveness: group.marketParamsAssertionliveness,
        bondAmount: group.marketParamsBondamount,
        bondCurrency: group.marketParamsBondcurrency,
        uniswapPositionManager: group.marketParamsUniswappositionmanager,
        uniswapSwapRouter: group.marketParamsUniswapswaprouter,
        uniswapQuoter: group.marketParamsUniswapquoter,
        optimisticOracleV3: group.marketParamsOptimisticoraclev3,
      };
      // Validate numeric marketParams fields
      const feeRateNumber = Number(marketParams.feeRate);
      const assertionLivenessNumber = Number(marketParams.assertionLiveness);
      const bondAmountNumber = Number(marketParams.bondAmount);

      if (
        Number.isNaN(feeRateNumber) ||
        Number.isNaN(assertionLivenessNumber) ||
        Number.isNaN(bondAmountNumber)
      ) {
        throw new Error('Invalid numeric value in marketParams.');
      }

      // Prepare parameters for the contract call
      const args = [
        group.collateralAsset as Address,
        BigInt(group.minTradeSize),
        group.isBridged,
        {
          feeRate: feeRateNumber,
          assertionLiveness: BigInt(assertionLivenessNumber),
          bondAmount: BigInt(bondAmountNumber),
          bondCurrency: marketParams.bondCurrency as Address,
          uniswapPositionManager:
            marketParams.uniswapPositionManager as Address,
          uniswapSwapRouter: marketParams.uniswapSwapRouter as Address,
          uniswapQuoter: marketParams.uniswapQuoter as Address,
          optimisticOracleV3: marketParams.optimisticOracleV3 as Address,
        },
        BigInt(group.initializationNonce),
      ] as const;

      console.log('Calling writeContract with args:', args);

      if (currentChainId !== group.chainId && switchChain) {
        switchChain({ chainId: group.chainId });
        return;
      }

      writeContract({
        address: group.factoryAddress as Address,
        abi: sapienceFactoryAbi().abi,
        functionName: 'cloneAndInitializeMarketGroup',
        args,
      });
    } catch (err) {
      console.error('Deployment preparation error:', err);
      const message =
        err instanceof Error ? err.message : 'Invalid data provided.';
      setDeployError(`Failed to prepare deployment: ${message}`);
    }
  };

  // Determine if button should be disabled
  const isDeployDisabled =
    !!group.address ||
    !group.initializationNonce ||
    !group.factoryAddress ||
    isWritePending ||
    isConfirming;
  const effectiveError =
    deployError || writeError?.message || receiptError?.message;

  const getButtonState = () => {
    if (isConfirming) return { text: 'Confirming...', loading: true };
    if (isWritePending) return { text: 'Sending...', loading: true };
    if (isConfirmed && deployedAddress)
      return { text: 'Deployed', loading: false, success: true };
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
          // Disable if already deployed (has address) or missing nonce/factory
          disabled={
            !!group.address ||
            !group.initializationNonce ||
            !group.factoryAddress
          }
        >
          {group.address ? 'Deployed' : 'Deploy'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Deploy Market Group</DialogTitle>
          <DialogDescription>
            {group.question || `Deploy group for chain ${group.chainId}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Display parameters */}
          <p className="text-sm text-muted-foreground">
            Chain ID: {group.chainId || NOT_AVAILABLE} <br />
            Nonce: {group.initializationNonce || NOT_AVAILABLE} <br />
            Factory: {group.factoryAddress || NOT_AVAILABLE} <br />
            Collateral: {group.collateralAsset || NOT_AVAILABLE} <br />
            Min Trade Size: {group.minTradeSize || NOT_AVAILABLE}
            {/* Add more params if needed */}
          </p>

          {/* Deploy Button */}
          <Button
            onClick={handleDeployClick}
            disabled={isDeployDisabled || buttonSuccess}
            className="w-full"
          >
            {buttonLoading && (
              <Loader2 className={`mr-2 ${ICON_SIZE} animate-spin`} />
            )}
            {buttonText}
          </Button>

          {/* Status/Error Display */}
          {effectiveError && (
            <Alert variant="destructive">
              <AlertCircle className={ICON_SIZE} />
              <AlertTitle>Deployment Error</AlertTitle>
              <AlertDescription>{effectiveError}</AlertDescription>
            </Alert>
          )}
          {hash && !isConfirmed && (
            <Alert variant="default">
              {isConfirming ? (
                <Loader2 className={`${ICON_SIZE} animate-spin`} />
              ) : (
                <CheckCircle className={ICON_SIZE} />
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
          {isConfirmed && deployedAddress && (
            <Alert variant="default">
              <CheckCircle className={ICON_SIZE} />
              <AlertTitle>Deployment Successful!</AlertTitle>
              <AlertDescription>
                Market Group Deployed at:{' '}
                <code className="text-xs break-all">{deployedAddress}</code>
              </AlertDescription>
            </Alert>
          )}
          {isConfirmed && !deployedAddress && !receiptError && (
            <Alert variant="destructive">
              <AlertCircle className={ICON_SIZE} />
              <AlertTitle>Deployment Issue</AlertTitle>
              <AlertDescription>
                {deployError ||
                  'Transaction confirmed, but failed to find the deployment event.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketGroupDeployButton;
