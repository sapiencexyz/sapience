'use client';

import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import ProfileHeader from '~/components/profile/ProfileHeader';

export default function PortfolioPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  const content = <UserPositionsTable account={address} />;

  return (
    <div className="container max-w-6xl mx-auto py-32 px-4">
      <ProfileHeader address={address} />
      <div className="mt-12">{content}</div>
    </div>
  );
}
