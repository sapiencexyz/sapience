import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';

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
    baseTokenName,
    quoteTokenName,
    minTick,
    maxTick,
    marketAddress,
    chainId,
    abi,
    marketContractData,
    getPositionById,
  } = useForecast();

  const position = positionId ? getPositionById(positionId) : null;
  const hasPosition = !!position;

  const handleConnectWallet = async () => {
    setIsOpen(true);
  };

  const handleSuccess = (txHash: `0x${string}`) => {
    console.log('txHash', txHash);
  };

  const marketDetails = {
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
            isConnected={isConnected}
            onConnectWallet={handleConnectWallet}
            onSuccess={handleSuccess}
            positionId={positionId as string}
            mode={modifyMode}
          />
        </div>
      ) : (
        <CreateLiquidityForm
          marketDetails={marketDetails}
          isConnected={isConnected}
          onConnectWallet={handleConnectWallet}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default SimpleLiquidityWrapper;
