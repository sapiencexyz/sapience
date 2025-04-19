'use client';

import { useParams } from 'next/navigation';

import ErrorState from '~/components/profile/ErrorState';
import LoadingState from '~/components/profile/LoadingState';
import PositionsTable from '~/components/profile/PositionsTable';
import ProfileHeader from '~/components/profile/ProfileHeader';
import { usePositions } from '~/hooks/graphql/usePositions';

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase();

  const { data: positions, isLoading, error } = usePositions(address);

  let content;
  if (isLoading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState error={error} />;
  } else if (!positions || positions.length === 0) {
    content = (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          No positions found for this address
        </p>
      </div>
    );
  } else {
    content = <PositionsTable positions={positions} />;
  }

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <ProfileHeader address={address} />
      {content}
    </div>
  );
}
