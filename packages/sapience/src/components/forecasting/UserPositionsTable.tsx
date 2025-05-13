import type React from 'react';
import { useEffect } from 'react';
import type { Address } from 'viem';

import ErrorState from '../profile/ErrorState'; // Assuming similar loading/error components
import LoadingState from '../profile/LoadingState'; // Assuming similar loading/error components
import LpPositionsTable from '../profile/LpPositionsTable';
import PredictionPositionsTable from '../profile/PredictionPositionsTable';
import TraderPositionsTable from '../profile/TraderPositionsTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import { usePredictions } from '~/hooks/graphql/usePredictions';
import { SCHEMA_UID } from '~/lib/constants/eas';

interface UserPositionsTableProps {
  account: Address;
  marketAddress?: string;
  chainId?: number;
  marketId?: number; // Changed from string to number to match typical ID types
  refetchUserPositions?: () => void;
}

const UserPositionsTable: React.FC<UserPositionsTableProps> = ({
  account,
  marketAddress,
  chainId,
  marketId,
  refetchUserPositions,
}) => {
  const positionVars: {
    address: Address;
    marketAddress?: string;
    chainId?: number;
  } = { address: account };

  if (marketAddress && chainId) {
    positionVars.marketAddress = marketAddress;
    positionVars.chainId = chainId;
  }

  const {
    data: positionsData,
    isLoading: isLoadingPositions,
    error: positionsError,
    refetch: refetchPositions,
  } = usePositions(positionVars);

  const {
    data: attestationsData,
    isLoading: isLoadingAttestations,
    error: attestationsError,
    refetch: refetchAttestations,
  } = usePredictions({
    attesterAddress: account,
    schemaId: SCHEMA_UID,
    marketAddress,
    chainId,
    marketId,
  });

  const isLoading = isLoadingPositions || isLoadingAttestations;
  const error = positionsError || attestationsError;

  useEffect(() => {
    if (refetchUserPositions) {
      refetchPositions();
      refetchAttestations();
    }
  }, [refetchUserPositions, refetchPositions, refetchAttestations]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    // It's good practice to log the error as well
    console.error('Error fetching user positions or predictions:', error);
    return <ErrorState error={error} />;
  }

  let allPositions = positionsData || [];

  if (marketId !== undefined) {
    allPositions = allPositions.filter(
      (position) => position.market.marketId === marketId
    );
  }

  const traderPositions = allPositions.filter((position) => !position.isLP);
  const lpPositions = allPositions.filter((position) => position.isLP);
  const safeAttestations = attestationsData || [];

  const hasTraderPositions = traderPositions.length > 0;
  const hasLpPositions = lpPositions.length > 0;
  const hasAttestations = safeAttestations.length > 0;
  const hasAnyData = hasTraderPositions || hasLpPositions || hasAttestations;

  if (!hasAnyData) {
    return null;
  }

  return (
    <div className="space-y-8">
      {hasTraderPositions && (
        <TraderPositionsTable positions={traderPositions} />
      )}
      {hasLpPositions && <LpPositionsTable positions={lpPositions} />}
      {hasAttestations && (
        <PredictionPositionsTable attestations={safeAttestations} />
      )}
    </div>
  );
};

export default UserPositionsTable;
