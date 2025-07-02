import { Button } from '@sapience/ui/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { User } from 'lucide-react';
import Link from 'next/link';
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
  showProfileButton?: boolean;
  showHeaderText?: boolean;
}

const UserPositionsTable: React.FC<UserPositionsTableProps> = ({
  account,
  marketAddress,
  chainId,
  marketId,
  refetchUserPositions,
  showHeaderText = true,
  showProfileButton = true,
}) => {
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.3,
        staggerChildren: 0.1,
      },
    },
  };

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
      (position) => position.market?.marketId === marketId
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
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence mode="wait">
        {hasAnyData && showHeaderText && (
          <motion.h3
            className="text-2xl font-medium mb-4"
            exit={{ opacity: 0, y: -10 }}
          >
            Your Positions
          </motion.h3>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hasTraderPositions && (
          <motion.div
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
          >
            <TraderPositionsTable
              positions={traderPositions}
              parentMarketAddress={marketAddress}
              parentChainId={chainId}
              parentMarketId={marketId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hasLpPositions && (
          <motion.div
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
          >
            <LpPositionsTable
              positions={lpPositions}
              parentMarketAddress={marketAddress}
              parentChainId={chainId}
              parentMarketId={marketId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hasAttestations && (
          <motion.div
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
          >
            <PredictionPositionsTable
              attestations={safeAttestations}
              parentMarketAddress={marketAddress}
              parentChainId={chainId}
              parentMarketId={marketId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileButton && (
          <motion.div
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
          >
            <Link href={`/profile/${account}`}>
              <Button>
                <User className="h-4 w-4" />
                View Your Profile
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default UserPositionsTable;
