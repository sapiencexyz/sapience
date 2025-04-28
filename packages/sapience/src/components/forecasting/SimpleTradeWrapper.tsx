import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import type React from 'react';
import { useAccount } from 'wagmi';

import { useForecast } from '~/lib/context/ForecastProvider';

import { CreateTradeForm, ModifyTradeForm } from './forms';
import type { TradeFormMarketDetails } from './forms/CreateTradeForm';

interface SimpleTradeWrapperProps {
  positionId?: string;
}

const SimpleTradeWrapper: React.FC<SimpleTradeWrapperProps> = ({
  positionId,
}) => {
  const { isConnected } = useAccount();
  const { connectOrCreateWallet } = useConnectOrCreateWallet();

  const {
    collateralAssetTicker,
    marketAddress,
    numericMarketId,
    chainId,
    abi,
    collateralAssetAddress,
    getPositionById,
    refetchPositions,
  } = useForecast();

  const position = positionId ? getPositionById(positionId) : null;
  const hasPosition = !!position && position.kind === 2;

  const handleConnectWallet = async () => {
    await connectOrCreateWallet();
  };

  const handleSuccess = (txHash: `0x${string}`) => {
    refetchPositions();
  };

  const marketDetails: TradeFormMarketDetails = {
    marketAddress: marketAddress as `0x${string}`,
    numericMarketId: numericMarketId as number,
    chainId: chainId as number,
    marketAbi: abi,
    collateralAssetTicker,
    collateralAssetAddress,
  };

  return (
    <div className="h-full">
      {hasPosition ? (
        <div className="space-y-4">
          <ModifyTradeForm
            marketDetails={marketDetails}
            isConnected={isConnected}
            onConnectWallet={handleConnectWallet}
            onSuccess={handleSuccess}
            positionId={positionId as string}
          />
        </div>
      ) : (
        <CreateTradeForm
          marketDetails={marketDetails}
          isConnected={isConnected}
          onConnectWallet={handleConnectWallet}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default SimpleTradeWrapper;
