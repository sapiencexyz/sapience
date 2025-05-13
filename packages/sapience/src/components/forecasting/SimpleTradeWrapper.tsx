import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import type React from 'react';
import { useAccount } from 'wagmi';

import { useForecast } from '~/lib/context/ForecastProvider';
import { useSapience } from '~/lib/context/SapienceProvider';

import { CreateTradeForm, ModifyTradeForm } from './forms';
import type { TradeFormMarketDetails } from './forms/CreateTradeForm';

interface SimpleTradeWrapperProps {
  positionId?: string;
  onActionComplete?: () => void;
}

const SimpleTradeWrapper: React.FC<SimpleTradeWrapperProps> = ({
  positionId,
  onActionComplete,
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

  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();

  const position = positionId ? getPositionById(positionId) : null;
  const hasPosition = !!position && position.kind === 2;

  const handleConnectWallet = async () => {
    await connectOrCreateWallet();
  };

  const handleSuccess = () => {
    refetchPositions();
    onActionComplete?.();
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
            permitData={permitData}
            isPermitLoadingPermit={isPermitLoadingPermit}
          />
        </div>
      ) : (
        <CreateTradeForm
          marketDetails={marketDetails}
          isConnected={isConnected}
          onConnectWallet={handleConnectWallet}
          onSuccess={handleSuccess}
          permitData={permitData}
          isPermitLoadingPermit={isPermitLoadingPermit}
        />
      )}
    </div>
  );
};

export default SimpleTradeWrapper;
