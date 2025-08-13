import { useWallets } from '@privy-io/react-auth'; // Import useWallets from Privy
import { Button } from '@sapience/ui/components/ui/button'; // Import Button
import { Input } from '@sapience/ui/components/ui/input'; // Import Input
import { Label } from '@sapience/ui/components/ui/label'; // Import Label
import { Separator } from '@sapience/ui/components/ui/separator'; // Import Separator
import { useToast } from '@sapience/ui/hooks/use-toast'; // Import useToast
import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi'; // Import the hook
import { Loader2 } from 'lucide-react'; // Import Loader2
import { useState } from 'react'; // Import useState and useMemo
import { erc20Abi, fromHex, zeroAddress } from 'viem'; // Import Abi type and fromHex
import { useReadContract, useWriteContract } from 'wagmi'; // Import wagmi hooks
import type { MarketType as Market } from '@sapience/ui/types'; // Import types

import { NO_SQRT_X96_PRICE, YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';

// Define MarketParams interface (consider moving to a shared location if needed)
interface MarketParams {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: `0x${string}`;
  feeRate: number;
  optimisticOracleV3: `0x${string}`;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
}

// Interface for MarketData based on ABI
interface MarketData {
  marketId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: `0x${string}`;
  quoteToken: `0x${string}`;
  baseToken: `0x${string}`;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  assertionId: `0x${string}`;
  claimStatementYesOrNumeric: `0x${string}`;
  claimStatementNo?: `0x${string}`; // This is a hex string for bytes
}

// Helper function (copied from PredictionInput) - Needs refinement for BigInt math
// TODO: Replace with a robust BigInt-based sqrt calculation if precision is critical
export const convertToSqrtPriceX96 = (price: number): string => {
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
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
  isBridged: boolean;
}

const BondInfoSection = ({
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
  isBridged,
}: BondInfoSectionProps) => (
  <div>
    <h4 className="text-sm font-medium mb-2">Bond Details</h4>
    <div className="text-xs text-muted-foreground space-y-1">
      {isBridged ? (
        <p>UMA Bond handled by bridge.</p>
      ) : (
        <>
          {isLoading && <p>Loading bond info...</p>}
          {/* Explicitly check if error exists before rendering */}
          {!!error && (
            <p className="text-red-500">
              Error loading bond info: {/* Safely access message property */}
              {error instanceof Error
                ? error.message
                : String(error) || 'Unknown error'}
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
        </>
      )}
    </div>
  </div>
);

interface SettleMarketDialogProps {
  market: Market; // Assume Market type includes baseTokenName/quoteTokenName or similar
  marketGroup: {
    address?: string | null;
    chainId: number;
    owner?: string | null;
    baseTokenName?: string | null;
    quoteTokenName?: string | null;
    isBridged?: boolean | null;
  };
}

const SettleMarketDialog = ({
  market,
  marketGroup,
}: SettleMarketDialogProps) => {
  // Use Privy's hook to get wallets
  const { wallets } = useWallets();
  const connectedWallet = wallets[0]; // Get the first connected wallet (if any)
  const connectedAddress = connectedWallet?.address as
    | `0x${string}`
    | undefined; // Extract address

  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);

  // 1. Get the ABI using the hook
  const { abi: sapienceAbi } = useSapienceAbi();

  // 2. Fetch market data (which includes marketParams and claimStatement) using the ABI
  const {
    data: marketResult, // Typed as [MarketData, MarketParams] | undefined based on ABI
    isLoading: isLoadingMarketAndMarketGroupData,
    error: marketAndMarketGroupDataError,
  } = useReadContract({
    address: marketGroup.address as `0x${string}`,
    abi: sapienceAbi, // Use the fetched ABI
    functionName: 'getMarket',
    args: [BigInt(market.marketId)],
    chainId: marketGroup.chainId,
    query: {
      enabled:
        !!sapienceAbi &&
        sapienceAbi.length > 0 &&
        !!marketGroup?.address &&
        !!marketGroup?.chainId &&
        market.marketId !== undefined && // Ensure marketId is available
        market.marketId !== null,
    },
  });
  console.log('marketResult', marketResult);
  // Destructure the result from getMarket with type safety
  const marketData: MarketData | undefined =
    Array.isArray(marketResult) && marketResult.length > 0
      ? (marketResult[0] as MarketData)
      : undefined;
  const marketParams: MarketParams | undefined =
    Array.isArray(marketResult) && marketResult.length > 1
      ? (marketResult[1] as MarketParams)
      : undefined;

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
    isLoadingMarketAndMarketGroupData ||
    (!!connectedAddress && isLoadingAllowance); // Check connectedAddress existence
  const error = marketAndMarketGroupDataError || allowanceError;

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
      onError: (settleError) => {
        console.error('Failed to settle market: ', settleError);
        setIsSettling(false);
        toast({
          variant: 'destructive',
          title: 'Failed to settle market',
          description: settleError.message, // Assuming settleError has a message
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

  // Add this helper function to calculate settlement price
  const calculateSettlementPrice = (
    inputValue: string,
    isYesNoMarket: boolean
  ): { price: bigint | null; errorMessage?: string } => {
    // For Yes/No markets
    if (isYesNoMarket) {
      if (inputValue !== '0' && inputValue !== '1') {
        return {
          price: null,
          errorMessage: 'Please select Yes or No.',
        };
      }
      // Use fixed sqrt prices for Yes (1.0) and No (0.0)
      return {
        price: inputValue === '1' ? YES_SQRT_X96_PRICE : NO_SQRT_X96_PRICE,
      };
    }

    // For numerical markets
    const numericValue = parseFloat(inputValue);
    if (Number.isNaN(numericValue) || numericValue < 0) {
      return {
        price: null,
        errorMessage: 'Please enter a valid non-negative number.',
      };
    }

    const sqrtPriceString = convertToSqrtPriceX96(numericValue);
    return { price: BigInt(sqrtPriceString) };
  };

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
      const marketId = BigInt(market.marketId);
      const { price, errorMessage } = calculateSettlementPrice(
        settlementValue,
        isYesNoMarket
      );

      if (errorMessage || price === null) {
        toast({
          variant: 'destructive',
          title: 'Invalid Settlement',
          description: errorMessage || 'Invalid price calculation',
        });
        return;
      }

      const args = {
        marketId,
        asserter: connectedAddress,
        settlementSqrtPriceX96: price,
      };

      settleWrite({
        address: marketGroup.address as `0x${string}`, // Settle is called on the market group address
        abi: sapienceAbi, // Use the dynamically loaded ABI
        functionName: 'submitSettlementPrice', // Corrected function name
        args: [args],
        chainId: marketGroup.chainId,
      });
    } catch (settlePrepareError: unknown) {
      console.error(
        'Error preparing settlement transaction:',
        settlePrepareError
      );
      setIsSettling(false);
      const message =
        settlePrepareError instanceof Error
          ? settlePrepareError.message
          : 'An unexpected error occurred preparing the transaction.';
      toast({
        variant: 'destructive',
        title: 'Settlement Error',
        description: message,
      });
    }
  };

  // Determine input type and unit display
  // Prefer on-chain signal: presence of a non-empty claimStatementNo means Yes/No market
  const hasClaimNo =
    !!marketData?.claimStatementNo &&
    marketData.claimStatementNo !== '0x' &&
    marketData.claimStatementNo.length > 2;
  const isYesNoMarket = hasClaimNo || marketGroup.baseTokenName === 'Yes';
  let unitDisplay: string;
  if (isYesNoMarket) {
    unitDisplay = '';
  } else if (marketGroup.baseTokenName && marketGroup.quoteTokenName) {
    unitDisplay = `${marketGroup.baseTokenName}/${marketGroup.quoteTokenName}`;
  } else {
    unitDisplay = 'Units'; // Fallback unit string
  }

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
      <Separator />
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
        isBridged={!!marketGroup.isBridged}
      />
      <Separator />
      {/* Settlement Section - Now uses extracted components */}
      <div>
        <h4 className="text-sm font-medium mb-2">Settle Market</h4>
        <div className="space-y-4">
          {/* Settlement Input */}
          <SettlementInput
            isYesNoMarket={isYesNoMarket}
            settlementValue={settlementValue}
            setSettlementValue={setSettlementValue}
            isSettling={isSettling}
            connectedAddress={connectedAddress}
            unitDisplay={unitDisplay}
          />

          {/* Parameters Display */}
          <SettlementParamsDisplay
            marketId={market.marketId.toString()}
            connectedAddress={connectedAddress}
            isYesNoMarket={isYesNoMarket}
            settlementValue={settlementValue}
            claimStatementYesOrNumeric={
              marketData?.claimStatementYesOrNumeric ?? ''
            }
            claimStatementNo={marketData?.claimStatementNo ?? ''}
          />

          {/* Submit Button */}
          <SettleButton
            isSettling={isSettling}
            requiresApproval={requiresApproval}
            canSettle={canSettle}
            settlementValue={settlementValue}
            isApproving={isApproving}
            handleSettle={handleSettle}
            connectedAddress={connectedAddress}
          />
        </div>
      </div>
    </div>
  );
};

// NEW: Component for Settlement Input (Yes/No or Numerical)
interface SettlementInputProps {
  isYesNoMarket: boolean;
  settlementValue: string;
  setSettlementValue: (value: string) => void;
  isSettling: boolean;
  connectedAddress: `0x${string}` | undefined;
  unitDisplay: string;
}

const SettlementInput = ({
  isYesNoMarket,
  settlementValue,
  setSettlementValue,
  isSettling,
  connectedAddress,
  unitDisplay,
}: SettlementInputProps) => {
  if (isYesNoMarket) {
    return (
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
    );
  }
  return (
    <div className="relative">
      <Label htmlFor="settlement-value" className="sr-only">
        Settlement Value
      </Label>
      <Input
        id="settlement-value"
        name="settlementValue"
        type="number"
        placeholder="Enter settlement value"
        value={settlementValue}
        onChange={(e) => setSettlementValue(e.target.value)}
        disabled={isSettling || !connectedAddress}
        className="pr-28" // Add padding for unit display
        min="0" // Ensure non-negative input
        step="any" // Allow decimals
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        {unitDisplay}
      </div>
    </div>
  );
};

// Helper function to decode and display claim statement
const decodeClaimStatement = (claimStatement: string): string => {
  let displayClaimStatement = 'N/A';

  if (
    claimStatement &&
    claimStatement.startsWith('0x') &&
    claimStatement.length > 2
  ) {
    try {
      // Ensure it's a valid hex string before attempting conversion
      displayClaimStatement = fromHex(
        claimStatement as `0x${string}`,
        'string'
      );
    } catch (e) {
      console.error('Failed to convert claim statement from hex:', e);
      displayClaimStatement = 'Error decoding statement';
    }
  } else if (claimStatement) {
    // If it's not a valid hex (e.g. empty or just "0x"), or not hex at all but somehow passed
    displayClaimStatement = claimStatement === '0x' ? 'N/A' : claimStatement;
  }

  return displayClaimStatement;
};

// NEW: Component for displaying settlement parameters
interface SettlementParamsDisplayProps {
  marketId: string | number; // Allow string or number
  connectedAddress: `0x${string}` | undefined;
  isYesNoMarket: boolean;
  settlementValue: string;
  claimStatementYesOrNumeric: string; // hex string or empty
  claimStatementNo?: string; // hex string or empty
}

const SettlementParamsDisplay = ({
  connectedAddress,
  isYesNoMarket,
  settlementValue,
  claimStatementYesOrNumeric,
  claimStatementNo,
}: SettlementParamsDisplayProps) => {
  if (isYesNoMarket) {
    const yesText = decodeClaimStatement(claimStatementYesOrNumeric);
    const noText = decodeClaimStatement(claimStatementNo || '');
    const selectedText =
      settlementValue === '1' ? yesText : settlementValue === '0' ? noText : '';

    return (
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Connected Wallet: {connectedAddress || 'N/A'}</p>
        <p className="font-bold">{selectedText || 'Select Yes or No'}</p>
      </div>
    );
  }

  // Numeric/scalar: keep current behavior (claim followed by settlement display value)
  let settlementDisplayValue: string;
  const numericValue = Number(settlementValue);
  if (Number.isNaN(numericValue) || settlementValue === '') {
    settlementDisplayValue = 'Invalid Price';
  } else {
    settlementDisplayValue = convertToSqrtPriceX96(numericValue);
  }

  const displayClaimStatement = decodeClaimStatement(
    claimStatementYesOrNumeric
  );

  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p>Connected Wallet: {connectedAddress || 'N/A'}</p>
      <p className="font-bold">
        {displayClaimStatement} {settlementDisplayValue}
      </p>
    </div>
  );
};

// NEW: Component for Settle Button and related messages
interface SettleButtonProps {
  isSettling: boolean;
  requiresApproval: boolean;
  canSettle: boolean;
  settlementValue: string;
  isApproving: boolean;
  handleSettle: () => void;
  connectedAddress: `0x${string}` | undefined;
}

const SettleButton = ({
  isSettling,
  requiresApproval,
  canSettle,
  settlementValue,
  isApproving,
  handleSettle,
  connectedAddress,
}: SettleButtonProps) => {
  let buttonText = 'Settle Market';
  if (isSettling) {
    buttonText = 'Submitting Settlement...';
  } else if (requiresApproval) {
    buttonText = 'Bond Requires Approval';
  }

  return (
    <>
      <Button
        onClick={handleSettle}
        disabled={
          isSettling || !canSettle || settlementValue === '' || isApproving
        }
        className="w-full"
      >
        {isSettling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {buttonText}
      </Button>
      {!connectedAddress && (
        <p className="text-xs text-orange-500 text-center mt-1">
          Connect wallet to settle.
        </p>
      )}
    </>
  );
};

export default SettleMarketDialog;
