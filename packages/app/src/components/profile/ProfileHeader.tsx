'use client';

import EnsAvatar from '~/components/shared/EnsAvatar';

import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { cn } from '@sapience/ui/lib/utils';

interface ProfileHeaderProps {
  address: string;
  className?: string;
}

export default function ProfileHeader({
  address,
  className,
}: ProfileHeaderProps) {
  return (
    <div className={cn('flex flex-row items-center gap-4', className)}>
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
            className="text-lg text-brand-white"
          />
        </div>
        <div className="hidden sm:block scale-125 origin-left">
          <AddressDisplay
            address={address}
            disableProfileLink
            className="text-xl text-brand-white !gap-1.5"
          />
        </div>
      </div>
    </div>
  );
}
