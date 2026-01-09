'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getBlockieSrc } from '~/lib/avatar';
import { cn } from '~/lib/utils/util';
import { useEnsAvatar } from '~/hooks/useEnsAvatar';

interface EnsAvatarProps {
  address: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  rounded?: boolean;
}

export default function EnsAvatar({
  address,
  alt,
  className,
  width = 20,
  height = 20,
  rounded = true,
}: EnsAvatarProps) {
  const { data: avatarUrl } = useEnsAvatar(address);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Reset loaded state whenever the avatar URL or address changes
    setIsLoaded(false);
  }, [avatarUrl, address]);

  const wrapperClass = cn(
    'relative inline-block overflow-hidden bg-background',
    rounded ? 'rounded-sm' : '',
    'ring-1 ring-border',
    className
  );

  const blockieSrc = getBlockieSrc(address);

  return (
    <div className={wrapperClass} style={{ width, height }}>
      {avatarUrl ? (
        <Image
          alt={alt || address}
          src={avatarUrl}
          fill
          className={cn(
            'object-cover transition-opacity duration-200 ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoadingComplete={() => setIsLoaded(true)}
          unoptimized
        />
      ) : (
        <Image
          alt={alt || address}
          src={blockieSrc}
          fill
          className={cn('object-cover')}
          unoptimized
        />
      )}
    </div>
  );
}
