import { Button } from '@foil/ui/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';

interface CollateralBalanceProps {
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  onSetWagerAmount?: (amount: string) => void;
  chainId?: number;
  chainShortName?: string;
}

export default function CollateralBalance({
  collateralSymbol,
  collateralAddress,
  onSetWagerAmount,
  chainId,
  chainShortName,
}: CollateralBalanceProps) {
  const { address: accountAddress, isConnected } = useAccount();

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
        isConnected && !!accountAddress && !!collateralAddress && !!chainId,
    },
  });

  const fetchedBalance = balanceData?.formatted ?? '0';

  useEffect(() => {
    if (isConnected && !!accountAddress && !!collateralAddress && !!chainId) {
      refetchBalance();
    }
  }, [isConnected, accountAddress, collateralAddress, chainId, refetchBalance]);

  const numericBalance = parseFloat(fetchedBalance);

  const handleSetWager = (percentage: number) => {
    if (onSetWagerAmount && numericBalance > 0) {
      const amount = (numericBalance * percentage).toString();
      onSetWagerAmount(amount);
    }
  };

  if (
    !isConnected ||
    (isConnected &&
      !isBalanceLoading &&
      (numericBalance === 0 || Number.isNaN(numericBalance)))
  ) {
    return (
      <div className="flex items-center space-x-2">
        <a
          href={`https://swap.defillama.com/?chain=${chainShortName}&to=${collateralAddress}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="xs" className="text-xs" type="button">
            Get {collateralSymbol}
          </Button>
        </a>
      </div>
    );
  }

  if (isBalanceLoading) {
    return (
      <div className="flex items-center space-x-2 px-2">
        <Loader2 className="h-6 w-6 animate-spin text-xs text-muted-foreground" />
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
            className="text-xs"
            onClick={() => handleSetWager(0.5)}
            type="button"
          >
            50%
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="text-xs"
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
