'use client';

import type { Address } from 'viem';
import EmptyTabState from '~/components/shared/EmptyTabState';

export default function UserParlaysTable({
  showHeaderText = true,
}: {
  account: Address;
  chainId?: number;
  showHeaderText?: boolean;
  marketAddressFilter?: string;
}) {
  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      <EmptyTabState message="No parlays found" />
    </div>
  );
}
