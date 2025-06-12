'use client';

import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import ProfileHeader from '~/components/profile/ProfileHeader';

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <div className="mb-12">
        <ProfileHeader address={address} />
      </div>
      <UserPositionsTable account={address} showHeaderText={false} showProfileButton={false} />
    </div>
  );
}
