'use client';

import { useParams } from 'next/navigation';

import ErrorState from '~/components/profile/ErrorState';
import LoadingState from '~/components/profile/LoadingState';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import PredictionsTable from '~/components/profile/PredictionsTable';
import ProfileHeader from '~/components/profile/ProfileHeader';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import { usePredictions } from '~/hooks/graphql/usePredictions';
import { SCHEMA_UID } from '~/lib/constants/eas';

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase();

  const {
    data: positions,
    isLoading: isLoadingPositions,
    error: positionsError,
  } = usePositions(address);
  const {
    data: attestations,
    isLoading: isLoadingAttestations,
    error: attestationsError,
  } = usePredictions({ attesterAddress: address, schemaId: SCHEMA_UID });

  const isLoading = isLoadingPositions || isLoadingAttestations;
  const error = positionsError || attestationsError;

  let content;
  if (isLoading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState error={error} />;
  } else {
    const traderPositions =
      positions?.filter((position: any) => !position.isLP) || [];
    const lpPositions =
      positions?.filter((position: any) => position.isLP) || [];
    const safeAttestations = attestations || [];

    const hasTraderPositions = traderPositions.length > 0;
    const hasLpPositions = lpPositions.length > 0;
    const hasAttestations = safeAttestations.length > 0;
    const hasAnyData = hasTraderPositions || hasLpPositions || hasAttestations;

    if (!hasAnyData) {
      content = (
        <div className="py-16 text-muted-foreground flex justify-center items-center">
          <p className="text-center text-base">
            This profile has no positions or predictions yet.
          </p>
        </div>
      );
    } else {
      content = (
        <div className="space-y-8">
          <TraderPositionsTable positions={traderPositions} />
          <LpPositionsTable positions={lpPositions} />
          <PredictionsTable attestations={safeAttestations} />
        </div>
      );
    }
  }

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <ProfileHeader address={address} />
      <div className="mt-12">{content}</div>
    </div>
  );
}
