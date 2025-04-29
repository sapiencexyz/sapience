import { Button } from '@foil/ui/components/ui/button'; // Import Button
import { Input } from '@foil/ui/components/ui/input'; // Import Input
import { Label } from '@foil/ui/components/ui/label'; // Import Label
import { Separator } from '@foil/ui/components/ui/separator'; // Import Separator
import { useToast } from '@foil/ui/hooks/use-toast'; // Import useToast
import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi'; // Import the hook
import { useWallets } from '@privy-io/react-auth'; // Import useWallets from Privy
import { Loader2 } from 'lucide-react'; // Import Loader2
import type React from 'react';
import { useState } from 'react'; // Import useState and useMemo
import { zeroAddress, erc20Abi } from 'viem'; // Import Abi type
import { useReadContract, useWriteContract } from 'wagmi'; // Import wagmi hooks

import type { Market, MarketGroup } from '~/hooks/graphql/useMarketGroups'; // Import types

// Define MarketParams interface (consider moving to a shared location if needed)
interface MarketParams {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: `0x${string}`;
  feeRate: number;
  optimisticOracleV3: string;
  claimStatement: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
}

// Helper function (copied from PredictionInput) - Needs refinement for BigInt math
// TODO: Replace with a robust BigInt-based sqrt calculation if precision is critical
export const convertToSqrtPriceX96 = (price: number): string => {
  if (typeof price !== 'number' || isNaN(price) || price < 0) {
    console.warn('Invalid price input for sqrtPriceX96 conversion:', price);
    return '0';
  }

  try {
    // Use BigInt for intermediate calculations to avoid precision loss
    const Q96 = BigInt(79228162514264337593543950336); // Precomputed 2^96
    // Approximate square root using Math.sqrt, then convert to BigInt
    // Note: This still relies on floating-point math for the sqrt part.
    const sqrtPrice = Math.sqrt(price);
    const scaledPrice = BigInt(Math.floor(sqrtPrice * Number(Q96))); // Convert Q96 back to Number for multiplication

    return scaledPrice.toString();
  } catch (error) {
    console.error('Error calculating sqrtPriceX96:', error);
    return '0';
  }
};

interface BondInfoSectionProps {
  isLoading: boolean;
  error: unknown;
  marketParams: MarketParams | undefined;
  connectedAddress: `0x${string}` | undefined;
  allowance: bigint | undefined;
  isLoadingAllowance: boolean;
  requiresApproval: boolean;
  isApproving: boolean;
  handleApprove: () => void;
  bondCurrency: `0x${string}` | undefined;
  bondAmount: bigint | undefined;
}

const BondInfoSection: React.FC<BondInfoSectionProps> = ({
  isLoading,
  error,
  marketParams,
  connectedAddress,
  allowance,
  isLoadingAllowance,
  requiresApproval,
  isApproving,
  handleApprove,
  bondCurrency,
  bondAmount,
}) => (
  <div>
    <h4 className="text-sm font-medium mb-2">Bond Details</h4>
    <div className="text-xs text-muted-foreground space-y-1">
      {isLoading && <p>Loading bond info...</p>}
      {/* Explicitly check if error exists before rendering */}
      {!!error && (
        <p className="text-red-500">
          Error loading bond info: {/* Safely access message property */}
          {(error as any)?.message || 'Unknown error'}
        </p>
      )}

      {/* Only show content if NOT loading and NOT erroring */}
      {!isLoading &&
        !error &&
        (marketParams ? (
          <>
            <p>Currency: {bondCurrency}</p>
            <p>Required Amount: {bondAmount?.toString() ?? 'N/A'}</p>
            {/* Only show allowance/approval if wallet is connected */}
            {connectedAddress ? (
              <>
                <p>
                  Your Allowance:{' '}
                  {isLoadingAllowance
                    ? 'Loading...'
                    : (allowance?.toString() ?? '0')}
                </p>
                {requiresApproval && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={handleApprove}
                      disabled={isApproving}
                    >
                      {isApproving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Approve Bond
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-orange-500 mt-1">
                Connect wallet to check allowance and approve.
              </p>
            )}
          </>
        ) : (
          <p>Bond information not found for this market.</p>
        ))}
    </div>
  </div>
);

interface SettleMarketDialogProps {
  market: Market; // Assume Market type includes baseTokenName/quoteTokenName or similar
  marketGroup: MarketGroup;
}

const SettleMarketDialog: React.FC<SettleMarketDialogProps> = ({
  market,
  marketGroup,
}) => {
  // Use Privy's hook to get wallets
  const { wallets } = useWallets();
  const connectedWallet = wallets[0]; // Get the first connected wallet (if any)
  const connectedAddress = connectedWallet?.address as
    | `0x${string}`
    | undefined; // Extract address

  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);

  // 1. Get the ABI using the hook
  const {
    abi: foilAbi,
    loading: isLoadingAbi,
    error: abiError,
  } = useFoilAbi(marketGroup.chainId);

  // 2. Fetch market data using the ABI
  const {
    data: marketViewResult,
    isLoading: isLoadingMarketData,
    error: marketDataError,
  } = useReadContract({
    address: marketGroup.address as `0x${string}`,
    abi: foilAbi, // Use the fetched ABI
    functionName: 'getMarket',
    chainId: marketGroup.chainId,
    query: {
      // Only run the query if we have the ABI and address/chainId
      enabled:
        !!foilAbi &&
        foilAbi.length > 0 &&
        !!marketGroup?.address &&
        !!marketGroup?.chainId,
    },
  });

  // Extract data (handle potential undefined result)
  const marketParams = marketViewResult?.[4] as MarketParams | undefined; // Cast to the defined type
  const bondCurrency = marketParams?.bondCurrency;
  const bondAmount = marketParams?.bondAmount;

  // 3. Fetch user allowance for the bond currency
  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: isLoadingAllowance,
    error: allowanceError,
  } = useReadContract({
    abi: erc20Abi,
    address: bondCurrency,
    functionName: 'allowance',
    args: [
      connectedAddress || zeroAddress,
      marketGroup.address as `0x${string}`,
    ],
    chainId: marketGroup.chainId,
    query: {
      // Ensure connectedAddress exists before enabling
      enabled: !!connectedAddress && !!bondCurrency && !!marketGroup.address,
    },
  });

  // 4. Prepare approve transaction
  const { writeContract: approveWrite } = useWriteContract({
    mutation: {
      onMutate: () => setIsApproving(true),
      onError: (error) => {
        console.error('Failed to approve: ', error);
        setIsApproving(false);
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: error.message,
        });
      },
      onSuccess: (hash) => {
        // Optional: Wait for transaction confirmation before showing success toast
        // For now, we show it immediately after submission
        toast({
          title: 'Approval submitted',
          description: `Transaction Hash: ${hash}`,
        });
        setIsApproving(false);
        // TODO: Ideally wait for tx confirmation then refetch
        setTimeout(() => refetchAllowance(), 3000); // Simple refetch after 3s
      },
    },
  });

  const handleApprove = () => {
    if (!bondAmount || !bondCurrency || !connectedAddress) return;
    approveWrite({
      abi: erc20Abi,
      address: bondCurrency,
      functionName: 'approve',
      args: [marketGroup.address as `0x${string}`, bondAmount],
      chainId: marketGroup.chainId,
    });
  };

  // Combined loading and error states
  const isLoading =
    isLoadingAbi ||
    isLoadingMarketData ||
    (!!connectedAddress && isLoadingAllowance); // Check connectedAddress existence
  const error = abiError || marketDataError || allowanceError;

  const requiresApproval =
    bondAmount !== undefined &&
    allowance !== undefined &&
    bondAmount > allowance;

  // --- Settlement State ---
  const [settlementValue, setSettlementValue] = useState<string>(''); // Use string to handle number input and '0'/'1'
  const [isSettling, setIsSettling] = useState(false);

  // --- Prepare Settle Tx ---
  const { writeContract: settleWrite } = useWriteContract({
    mutation: {
      onMutate: () => setIsSettling(true),
      onError: (error) => {
        console.error('Failed to settle market: ', error);
        setIsSettling(false);
        toast({
          variant: 'destructive',
          title: 'Failed to settle market',
          description: error.message,
        });
      },
      onSuccess: (hash) => {
        toast({
          title: 'Settlement submitted',
          description: `Transaction Hash: ${hash}`,
        });
        setIsSettling(false);
        // Optionally: Refetch market data or trigger other updates after settlement
      },
    },
  });

  // --- Handle Settlement ---
  const handleSettle = () => {
    if (
      !connectedAddress ||
      requiresApproval ||
      isSettling ||
      settlementValue === '' ||
      !marketGroup.owner
    ) {
      return;
    }

    try {
      const epochId = BigInt(market.marketId);
      let price: bigint;

      // Determine settlement price based on input type
      if (market.baseTokenName === 'Yes') {
        // Yes/No market
        if (settlementValue !== '0' && settlementValue !== '1') {
          toast({
            variant: 'destructive',
            title: 'Invalid Settlement',
            description: 'Please select Yes or No.',
          });
          return;
        }
        // Calculate sqrtPriceX96 for 1 if "Yes" is selected, otherwise use 0
        price =
          settlementValue === '1'
            ? BigInt(convertToSqrtPriceX96(1))
            : BigInt(0);
      } else {
        // Numerical market
        const numericValue = parseFloat(settlementValue);
        if (isNaN(numericValue) || numericValue < 0) {
          toast({
            variant: 'destructive',
            title: 'Invalid Settlement Price',
            description: 'Please enter a valid non-negative number.',
          });
          return;
        }
        const sqrtPriceString = convertToSqrtPriceX96(numericValue);
        price = BigInt(sqrtPriceString);
      }

      settleWrite({
        address: marketGroup.address as `0x${string}`, // Settle is called on the market group address
        abi: foilAbi, // Use the dynamically loaded ABI
        functionName: 'submitSettlementPrice', // Corrected function name
        args: [epochId, connectedAddress, price], // Add asserter (connectedAddress)
        chainId: marketGroup.chainId,
      });
    } catch (error: any) {
      console.error('Error preparing settlement transaction:', error);
      setIsSettling(false);
      toast({
        variant: 'destructive',
        title: 'Settlement Error',
        description:
          error.message ||
          'An unexpected error occurred preparing the transaction.',
      });
    }
  };

  // Determine input type and unit display
  // Assuming market.baseTokenName determines Yes/No vs Numerical
  // Assuming market.quoteTokenName provides units for numerical
  const isYesNoMarket = market.baseTokenName === 'Yes';
  const unitDisplay = isYesNoMarket ? '' : market.quoteTokenName || 'Units'; // Fallback unit

  // Determine if settlement is possible
  // Add check for market settlement status if available (e.g., market.settled)
  const canSettle = !requiresApproval && !!connectedAddress; // && !market.settled;

  return (
    <div className="space-y-4">
      {' '}
      {/* Add spacing between sections */}
      {/* Market Info Section */}
      <div>
        <h4 className="text-sm font-medium mb-2">Market Details</h4>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Chain ID: {marketGroup.chainId}</p>
          <p>Address: {marketGroup.address}</p>
          <p>Market ID: {market.marketId}</p>
        </div>
      </div>
      <Separator /> {/* Add a separator */}
      {/* Bond Info Section - Now uses the extracted component */}
      <BondInfoSection
        isLoading={isLoading}
        error={error}
        marketParams={marketParams}
        connectedAddress={connectedAddress}
        allowance={allowance}
        isLoadingAllowance={isLoadingAllowance}
        requiresApproval={requiresApproval}
        isApproving={isApproving}
        handleApprove={handleApprove}
        bondCurrency={bondCurrency}
        bondAmount={bondAmount}
      />
      <Separator /> {/* Add separator back */}
      {/* Settlement Section - NEW */}
      <div>
        <h4 className="text-sm font-medium mb-2">Settle Market</h4>
        <div className="space-y-4">
          {/* Settlement Input */}
          {isYesNoMarket ? (
            <div className="flex gap-4">
              <Button
                type="button"
                variant={settlementValue === '1' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSettlementValue('1')}
                disabled={isSettling || !connectedAddress}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={settlementValue === '0' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSettlementValue('0')}
                disabled={isSettling || !connectedAddress}
              >
                No
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Label htmlFor="settlement-value" className="sr-only">
                Settlement Value
              </Label>
              <Input
                id="settlement-value"
                name="settlementValue"
                type="number"
                placeholder={`Enter settlement value in ${unitDisplay}`}
                value={settlementValue}
                onChange={(e) => setSettlementValue(e.target.value)}
                disabled={isSettling || !connectedAddress}
                className="pr-20" // Add padding for unit display
                min="0" // Ensure non-negative input
                step="any" // Allow decimals
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                {unitDisplay}
              </div>
            </div>
          )}

          {/* Parameters Display - Simplified */}
          <div className="text-xs space-y-1 text-muted-foreground">
            {' '}
            {/* Added text-muted-foreground */}
            <p>
              <span>epochId:</span> {market.marketId}
            </p>
            <p>
              <span>asserter:</span> {connectedAddress || 'Not connected'}
            </p>
            {!isYesNoMarket &&
              settlementValue &&
              !isNaN(parseFloat(settlementValue)) && (
                <p>
                  <span>settlementSqrtPriceX96:</span>{' '}
                  {convertToSqrtPriceX96(parseFloat(settlementValue))}
                </p>
              )}
          </div>

          {/* Submit Button */}
          {(() => {
            let buttonText = 'Settle Market';
            if (isSettling) {
              buttonText = 'Submitting Settlement...';
            } else if (requiresApproval) {
              buttonText = 'Bond Requires Approval';
            }

            return (
              <Button
                onClick={handleSettle}
                disabled={
                  isSettling ||
                  !canSettle ||
                  settlementValue === '' ||
                  isApproving
                }
                className="w-full"
              >
                {isSettling && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {buttonText}
              </Button>
            );
          })()}
          {!connectedAddress && (
            <p className="text-xs text-orange-500 text-center mt-1">
              Connect wallet to settle.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettleMarketDialog;
