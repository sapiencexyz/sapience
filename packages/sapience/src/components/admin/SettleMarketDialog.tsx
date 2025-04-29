import { Button } from '@foil/ui/components/ui/button'; // Import Button
import { Separator } from '@foil/ui/components/ui/separator'; // Import Separator
import { useToast } from '@foil/ui/hooks/use-toast'; // Import useToast
import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi'; // Import the hook
import { useWallets } from '@privy-io/react-auth'; // Import useWallets from Privy
import { Loader2 } from 'lucide-react'; // Import Loader2
import type React from 'react';
import { useState } from 'react'; // Import useState
import { zeroAddress, erc20Abi } from 'viem';
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
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="mt-4"
                  >
                    {isApproving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Approve Bond
                  </Button>
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
  market: Market;
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
      {/* TODO: Add settlement form elements here */}
      <Separator />
      <div>
        <h4 className="text-sm font-medium mb-2">Settle</h4>
        {/* Placeholder for settlement form */}
        <p className="text-xs text-muted-foreground">
          Settlement form elements go here.
        </p>
      </div>
    </div>
  );
};

export default SettleMarketDialog;
