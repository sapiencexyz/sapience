import type React from 'react';
import { useAccount } from 'wagmi';

import { useConnectWallet } from '~/lib/context/ConnectWalletProvider';
import { useForecast } from '~/lib/context/ForecastProvider';

import { LiquidityForm } from './forms';

const SimpleLiquidityWrapper: React.FC = () => {
  const { isConnected } = useAccount();
  const { setIsOpen } = useConnectWallet();

  // Get data from the forecast context
  const {
    collateralAssetTicker,
    baseTokenName,
    quoteTokenName,
    minTick,
    maxTick,
    marketAddress,
    chainId,
    abi,
    marketContractData,
  } = useForecast();

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

  const handleSuccess = (txHash: `0x${string}`) => {
    console.log('txHash', txHash);
  };

  return (
    <div className="h-full">
      <LiquidityForm
        marketDetails={{
          marketAddress: marketAddress as `0x${string}`,
          chainId: chainId as number,
          marketId: marketContractData.epochId,
          marketAbi: abi,
          collateralAssetTicker,
          virtualBaseTokensName: baseTokenName,
          virtualQuoteTokensName: quoteTokenName,
          lowPriceTick: minTick,
          highPriceTick: maxTick,
        }}
        isConnected={isConnected}
        onConnectWallet={handleConnectWallet}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default SimpleLiquidityWrapper;
