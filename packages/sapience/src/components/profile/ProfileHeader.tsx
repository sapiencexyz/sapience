'use client';

import EnsAvatar from '~/components/shared/EnsAvatar';

import { AddressDisplay } from '~/components/shared/AddressDisplay';

interface ProfileHeaderProps {
  address: string;
}

export default function ProfileHeader({ address }: ProfileHeaderProps) {
  return (
    <div className="mb-6 flex flex-row items-center gap-4">
      <EnsAvatar
        address={address}
        className="w-16 h-16"
        width={64}
        height={64}
      />
      <div>
        <p className="text-muted-foreground block mb-1">
          Ethereum Account Address
        </p>
        <div className="sm:hidden scale-110 origin-left">
          <AddressDisplay
            address={address}
            disableProfileLink
            className="text-lg"
          />
        </div>
        <div className="hidden sm:block scale-125 origin-left">
          <AddressDisplay
            address={address}
            disableProfileLink
            className="text-xl"
          />
        </div>
      </div>
    </div>
  );
}
