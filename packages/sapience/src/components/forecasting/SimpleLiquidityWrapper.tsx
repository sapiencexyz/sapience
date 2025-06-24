import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { Tabs, TabsList, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { useTokenBalance } from '~/hooks/contract';
import { useMarketPage } from '~/lib/context/MarketPageProvider';
import { useSapience } from '~/lib/context/SapienceProvider';

import { CreateLiquidityForm, ModifyLiquidityForm } from './forms';

interface SimpleLiquidityWrapperProps {
  positionId?: string;
  onActionComplete?: () => void;
}

const SimpleLiquidityWrapper: React.FC<SimpleLiquidityWrapperProps> = ({
  positionId,
  onActionComplete,
}) => {
  const { isConnected } = useAccount();
  const { connectOrCreateWallet } = useConnectOrCreateWallet();
  const [modifyMode, setModifyMode] = useState<'add' | 'remove'>('add');

  // Fetch permit data using useSapience hook
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();

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
  } = useMarketPage();

  // Move useTokenBalance hook here
  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId: chainId as number,
    enabled: isConnected && !!collateralAssetAddress,
  });

  // Add loading/missing data check
  if (
    !marketContractData ||
    !marketGroupParams ||
    !marketAddress ||
    !chainId ||
    !collateralAssetAddress
  ) {
    // Render loading state or null while data is not ready
    // TODO: Add a proper loading skeleton or indicator
    return null;
  }

  const position = positionId ? getPositionById(positionId) : null;
  const hasPosition = !!position;

  const handleConnectWallet = async () => {
    await connectOrCreateWallet();
  };

  const handleSuccess = () => {
    refetchPositions();
    onActionComplete?.();
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
            permitData={permitData}
            isPermitLoadingPermit={isPermitLoadingPermit}
          />
        </div>
      ) : (
        <CreateLiquidityForm
          marketDetails={marketDetails}
          walletData={walletData}
          onSuccess={handleSuccess}
          permitData={permitData}
          isPermitLoadingPermit={isPermitLoadingPermit}
        />
      )}
    </div>
  );
};

export default SimpleLiquidityWrapper;
