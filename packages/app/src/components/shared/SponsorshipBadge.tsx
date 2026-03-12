'use client';

import { Gift } from 'lucide-react';

interface SponsorshipBadgeProps {
  /** Optional extra text shown after the icon (e.g. budget display) */
  label?: string;
  /** Whether to show the animated ping effect (default: true) */
  animated?: boolean;
  className?: string;
}

/**
 * Animated Gift icon badge indicating an active sponsorship.
 * Used in CollateralBalanceButton and potentially elsewhere.
 */
export default function SponsorshipBadge({
  label,
  animated = true,
  className,
}: SponsorshipBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="relative flex h-4 w-4">
        {animated && (
          <Gift className="absolute inline-flex h-full w-full text-ethena animate-ping opacity-75" />
        )}
        <Gift className="relative inline-flex h-4 w-4 text-ethena" />
      </span>
      {label && (
        <span className="text-ethena text-xs font-medium">{label}</span>
      )}
    </span>
  );
}
