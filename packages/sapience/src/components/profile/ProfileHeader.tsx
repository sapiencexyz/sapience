'use client';

import { blo } from 'blo';
import Image from 'next/image';

import { AddressDisplay } from '~/components/shared/AddressDisplay';

interface ProfileHeaderProps {
  address: string;
}

export default function ProfileHeader({ address }: ProfileHeaderProps) {
  return (
    <div className="mb-8 flex flex-row items-center gap-4">
      <Image
        alt={address}
        src={blo(address as `0x${string}`)}
        className="w-16 h-16 rounded"
        width={64}
        height={64}
      />
      <div>
        <p className="text-muted-foreground block mb-1">
          Ethereum Account Address
        </p>
        <div className="scale-125 origin-left">
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
