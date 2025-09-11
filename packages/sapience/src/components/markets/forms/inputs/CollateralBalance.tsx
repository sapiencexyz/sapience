import { Button } from '@sapience/ui/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';

interface CollateralBalanceProps {
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  onSetWagerAmount?: (amount: string) => void;
  chainId?: number;
  chainShortName?: string;
}

export default function CollateralBalance({
  collateralAddress,
  onSetWagerAmount,
  chainId,
}: CollateralBalanceProps) {
  const { address: accountAddress, isConnected } = useAccount();
  const { authenticated } = usePrivy();

  const {
    data: balanceData,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useBalance({
    address: accountAddress,
    token: collateralAddress,
    chainId,
    query: {
      enabled:
        authenticated &&
        isConnected &&
        !!accountAddress &&
        !!collateralAddress &&
        !!chainId,
    },
  });

  const fetchedBalance = balanceData?.formatted ?? '0';

  useEffect(() => {
    if (
      authenticated &&
      isConnected &&
      !!accountAddress &&
      !!collateralAddress &&
      !!chainId
    ) {
      refetchBalance();
    }
  }, [
    authenticated,
    isConnected,
    accountAddress,
    collateralAddress,
    chainId,
    refetchBalance,
  ]);

  const numericBalance = parseFloat(fetchedBalance);

  const handleSetWager = (percentage: number) => {
    if (onSetWagerAmount && numericBalance > 0) {
      const amount = (numericBalance * percentage).toString();
      onSetWagerAmount(amount);
    }
  };

  // Show "Get collateralSymbol" button that opens Privy login if wallet not connected
  if (!authenticated || !isConnected || !accountAddress) {
    return (
      <div className="flex items-center space-x-2">
        {/*
        <Button
          variant="default"
          size="xs"
          className="text-xs"
          onClick={login}
          type="button"
        >
          Get {collateralSymbol}
        </Button>
        */}
      </div>
    );
  }

  // Show "Get collateralSymbol" button if connected but no balance
  if (
    authenticated &&
    isConnected &&
    !isBalanceLoading &&
    (numericBalance === 0 || Number.isNaN(numericBalance))
  ) {
    return (
      <div className="flex items-center space-x-2">
        {/*
        <a
          href={`https://swap.defillama.com/?chain=${chainShortName}&to=${collateralAddress}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="default" size="xs" className="text-xs" type="button">
            Get {collateralSymbol}
          </Button>
        </a>
        */}
      </div>
    );
  }

  if (isBalanceLoading) {
    return (
      <div className="flex items-center space-x-2 px-2 py-1">
        <Loader2 className="h-5 w-5 animate-spin text-xs text-muted-foreground" />
      </div>
    );
  }

  if (!collateralAddress || !chainId) {
    return;
  }

  return (
    <div className="flex items-center space-x-2">
      {onSetWagerAmount && (
        <>
          <Button
            variant="outline"
            size="xs"
            className="h-6 px-1.5 text-xs leading-none"
            onClick={() => handleSetWager(0.5)}
            type="button"
          >
            50%
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="h-6 px-1.5 text-xs leading-none"
            onClick={() => handleSetWager(1)}
            type="button"
          >
            MAX
          </Button>
        </>
      )}
    </div>
  );
}
