'use client';

import Image from 'next/image';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { Copy, Gavel } from 'lucide-react';
import { useMemo } from 'react';
import { UMA_RESOLVER_DISPLAY } from '~/lib/constants';

interface ResolverBadgeProps {
  resolverAddress: string | null | undefined;
  size?: 'normal' | 'large';
  appearance?: 'default' | 'brandWhite';
  showCopyButton?: boolean;
  className?: string;
}

export function ResolverBadge({
  resolverAddress,
  size = 'normal',
  appearance = 'default',
  showCopyButton = false,
  className = '',
}: ResolverBadgeProps) {
  const resolverInfo = useMemo(() => {
    if (!resolverAddress) return null;
    const normalizedAddress = resolverAddress.toLowerCase();
    // Find matching resolver info (case-insensitive)
    const entry = Object.entries(UMA_RESOLVER_DISPLAY).find(
      ([address]) => address.toLowerCase() === normalizedAddress
    );
    return entry ? UMA_RESOLVER_DISPLAY[entry[0]] : null;
  }, [resolverAddress]);

  if (!resolverAddress) {
    return null;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const baseBadgeClasses =
    size === 'large'
      ? 'h-9 items-center px-3.5 text-sm leading-none font-medium'
      : 'h-9 items-center px-3.5 text-sm leading-none font-medium';
  const brandWhiteBadgeExtras =
    appearance === 'brandWhite' ? 'text-brand-white border-brand-white/20' : '';
  const badgeClassName =
    `inline-flex ${baseBadgeClasses} bg-card border-border ${brandWhiteBadgeExtras} ${className}`.trim();

  const iconSize = size === 'large' ? 36 : 32;
  const iconHeight = size === 'large' ? 36 : 32;
  const iconClass = size === 'large' ? 'h-9 w-9' : 'h-8 w-8';
  const gavelIconClass = size === 'large' ? 'h-4 w-4' : 'h-4 w-4';
  const gavelColorClass = appearance === 'brandWhite' ? 'text-brand-white' : '';
  const iconOpacity = appearance === 'brandWhite' ? 'opacity-70' : 'opacity-70';

  return (
    <Badge variant="outline" className={badgeClassName}>
      <Gavel
        className={`${gavelIconClass} mr-1.5 -mt-[1px] ${iconOpacity} -scale-x-100 ${gavelColorClass}`}
      />
      <span className="whitespace-nowrap">Resolver</span>
      {resolverInfo?.icon && (
        <>
          <span
            aria-hidden="true"
            className="mx-2.5 h-4 w-px bg-muted-foreground/30"
          />
          <a
            href="https://uma.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-70 transition-opacity"
            aria-label="Visit UMA website"
          >
            <Image
              src={resolverInfo.icon}
              alt={resolverInfo.iconAlt || resolverInfo.name}
              width={iconSize}
              height={iconHeight}
              className={iconClass}
            />
          </a>
        </>
      )}
      {showCopyButton && (
        <>
          <span
            aria-hidden="true"
            className="mx-2.5 h-4 w-px bg-muted-foreground/30"
          />
          <button
            type="button"
            onClick={() => copyToClipboard(resolverAddress)}
            className="text-muted-foreground hover:text-brand-white transition-colors"
            title="Copy full resolver address"
          >
            <Copy className={size === 'large' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
          </button>
        </>
      )}
    </Badge>
  );
}
