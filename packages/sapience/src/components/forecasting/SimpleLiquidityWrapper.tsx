import { useToast } from '@foil/ui/hooks/use-toast';
import type React from 'react';
import { useAccount } from 'wagmi';
import { useConnectWallet } from '~/lib/context/ConnectWalletProvider';
import { LiquidityForm } from './forms';

interface SimpleLiquidityWrapperProps {
  collateralAssetTicker: string;
  baseTokenName: string;
  quoteTokenName: string;
  minTick: number;
  maxTick: number;
}

const SimpleLiquidityWrapper: React.FC<SimpleLiquidityWrapperProps> = ({
  collateralAssetTicker,
  baseTokenName,
  quoteTokenName,
  minTick,
  maxTick,
}) => {
  const { toast } = useToast();
  const { isConnected } = useAccount();
  const { setIsOpen } = useConnectWallet();

  // const handleLiquiditySubmit = useCallback(
  //   (data: LiquidityFormValues) => {
  //     toast({
  //       title: 'Liquidity Added',
  //       description: `Deposit: ${data.depositAmount} ${collateralAssetTicker}, Low Price: ${data.lowPrice}, High Price: ${data.highPrice}, Slippage: ${data.slippage}%`,
  //     });
  //   },
  //   [toast, collateralAssetTicker]
  // );

  const handleConnectWallet = async () => {
    setIsOpen(true);
  };

  return (
    <div className="h-full">
      <LiquidityForm
        virtualBaseTokensName={baseTokenName}
        virtualQuoteTokensName={quoteTokenName}
        isConnected={isConnected}
        onConnectWallet={handleConnectWallet}
        collateralAssetTicker={collateralAssetTicker}
        lowPriceTick={minTick}
        highPriceTick={maxTick}
      />
    </div>
  );
};

export default SimpleLiquidityWrapper;
