import { Button } from '@sapience/ui/components/ui/button';
import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';

interface CollateralBalanceProps {
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  onSetPositionSize?: (amount: string) => void;
  chainId?: number;
  chainShortName?: string;
}

export default function CollateralBalance({
  onSetPositionSize,
  chainId,
}: CollateralBalanceProps) {
  const { address: accountAddress, isConnected } = useAccount();
  const { effectiveAddress } = useSession();

  const {
    balance: numericBalance,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address: effectiveAddress ?? undefined,
    chainId,
    enabled: isConnected && !!effectiveAddress && !!chainId,
  });

  useEffect(() => {
    if (isConnected && !!effectiveAddress && !!chainId) {
      refetchBalance();
    }
  }, [isConnected, effectiveAddress, chainId, refetchBalance]);

  const handleSetPositionSize = (percentage: number) => {
    if (onSetPositionSize && numericBalance > 0) {
      const amount = (numericBalance * percentage).toString();
      onSetPositionSize(amount);
    }
  };

  // Return null if missing required data or no valid balance
  const hasValidConnection = isConnected && accountAddress && chainId;
  const hasValidBalance =
    !isBalanceLoading && numericBalance > 0 && !Number.isNaN(numericBalance);

  if (!hasValidConnection) {
    return null;
  }

  if (!isBalanceLoading && !hasValidBalance) {
    return null;
  }

  const isReady = hasValidBalance;

  return (
    <div
      className={`flex items-center space-x-2 transition-opacity duration-300 ${
        isReady ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {onSetPositionSize && (
        <>
          <Button
            variant="outline"
            size="xs"
            className="h-6 px-1.5 text-xs leading-none"
            onClick={() => handleSetPositionSize(0.5)}
            type="button"
            disabled={!isReady}
          >
            50%
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="h-6 px-1.5 text-xs leading-none"
            onClick={() => handleSetPositionSize(1)}
            type="button"
            disabled={!isReady}
          >
            MAX
          </Button>
        </>
      )}
    </div>
  );
}
