import { Button } from '@sapience/sdk/ui/components/ui/button';
import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import Loader from '~/components/shared/Loader';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';

interface CollateralBalanceProps {
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  onSetWagerAmount?: (amount: string) => void;
  chainId?: number;
  chainShortName?: string;
}

export default function CollateralBalance({
  onSetWagerAmount,
  chainId,
}: CollateralBalanceProps) {
  const { address: accountAddress, isConnected } = useAccount();

  const {
    balance: numericBalance,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address: accountAddress,
    chainId,
    enabled: isConnected && !!accountAddress && !!chainId,
  });

  useEffect(() => {
    if (isConnected && !!accountAddress && !!chainId) {
      refetchBalance();
    }
  }, [isConnected, accountAddress, chainId, refetchBalance]);

  const handleSetWager = (percentage: number) => {
    if (onSetWagerAmount && numericBalance > 0) {
      const amount = (numericBalance * percentage).toString();
      onSetWagerAmount(amount);
    }
  };

  // Show "Get collateralSymbol" button that opens Privy login if wallet not connected
  if (!isConnected || !accountAddress) {
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
      <div className="flex items-center space-x-2 opacity-50 py-1">
        <Loader size={12} />
      </div>
    );
  }

  if (!chainId) {
    return null;
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
