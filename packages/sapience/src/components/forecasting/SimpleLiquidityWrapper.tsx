import type React from 'react';
import { useAccount } from 'wagmi';

import { useConnectWallet } from '~/lib/context/ConnectWalletProvider';
import { useForecast } from '~/lib/context/ForecastProvider';

import { CreateLiquidityForm } from './forms';

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

  const handleConnectWallet = async () => {
    setIsOpen(true);
  };

  const handleSuccess = (txHash: `0x${string}`) => {
    console.log('txHash', txHash);
  };

  return (
    <div className="h-full">
      <CreateLiquidityForm
        marketDetails={{
          marketAddress: marketAddress as `0x${string}`,
          chainId: chainId as number,
          marketId: marketContractData.epochId,
          marketAbi: abi,
          collateralAssetTicker,
          collateralAssetAddress: marketContractData.collateralAsset,
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
