'use client';

import type { Address } from 'viem';

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
      <div className="text-center text-muted-foreground py-16">Coming soon</div>
    </div>
  );
}
