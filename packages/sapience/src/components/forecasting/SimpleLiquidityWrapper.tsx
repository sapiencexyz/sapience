import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { useTokenBalance } from '~/hooks/contract';
import { useConnectWallet } from '~/lib/context/ConnectWalletProvider';
import { useForecast } from '~/lib/context/ForecastProvider';

import { CreateLiquidityForm, ModifyLiquidityForm } from './forms';

interface SimpleLiquidityWrapperProps {
  positionId?: string;
}

const SimpleLiquidityWrapper: React.FC<SimpleLiquidityWrapperProps> = ({
  positionId,
}) => {
  const { isConnected } = useAccount();
  const { setIsOpen } = useConnectWallet();
  const [modifyMode, setModifyMode] = useState<'add' | 'remove'>('add');

  // Get data from the forecast context
  const {
    collateralAssetTicker,
    collateralAssetAddress,
    baseTokenName,
    quoteTokenName,
    minTick,
    maxTick,
    marketAddress,
    chainId,
    abi,
    marketContractData,
    marketGroupParams,
    getPositionById,
    refetchPositions,
  } = useForecast();

  const position = positionId ? getPositionById(positionId) : null;
  const hasPosition = !!position;

  // Move useTokenBalance hook here
  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId: chainId as number,
    enabled: isConnected && !!collateralAssetAddress,
  });

  const handleConnectWallet = async () => {
    setIsOpen(true);
  };

  const handleSuccess = () => {
    refetchPositions();
  };

  const marketDetails = {
    marketAddress: marketAddress as `0x${string}`,
    chainId: chainId as number,
    marketId: marketContractData.epochId,
    marketAbi: abi,
    collateralAssetTicker,
    collateralAssetAddress: collateralAssetAddress as `0x${string}`,
    uniswapPositionManager: marketGroupParams.uniswapPositionManager,
    virtualBaseTokensName: baseTokenName,
    virtualQuoteTokensName: quoteTokenName,
    lowPriceTick: minTick,
    highPriceTick: maxTick,
  };

  // Create wallet data object
  const walletData = {
    isConnected,
    walletBalance,
    onConnectWallet: handleConnectWallet,
  };

  return (
    <div className="h-full">
      {hasPosition ? (
        <div className="space-y-4">
          <Tabs
            value={modifyMode}
            onValueChange={(value) => setModifyMode(value as 'add' | 'remove')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">Add</TabsTrigger>
              <TabsTrigger value="remove">Remove</TabsTrigger>
            </TabsList>
          </Tabs>

          <ModifyLiquidityForm
            marketDetails={marketDetails}
            walletData={walletData}
            onSuccess={handleSuccess}
            positionId={positionId as string}
            mode={modifyMode}
          />
        </div>
      ) : (
        <CreateLiquidityForm
          marketDetails={marketDetails}
          walletData={walletData}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default SimpleLiquidityWrapper;
