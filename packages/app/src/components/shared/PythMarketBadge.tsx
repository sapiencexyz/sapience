import type React from 'react';
import { PythOracleMark } from '@sapience/ui';
import { cn } from '@sapience/ui/lib/utils';

/**
 * Pyth oracle mark inside a muted circular badge.
 * Use in place of a category icon for Pyth-resolved conditions.
 */
export function PythMarketBadge({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        'w-6 h-6 rounded-full shrink-0 flex items-center justify-center',
        className
      )}
      style={{ backgroundColor: 'hsl(var(--muted))', ...style }}
    >
      <PythOracleMark
        className="h-3 w-3 text-foreground/80"
        src="/pyth-network.svg"
        alt="Pyth"
      />
    </div>
  );
}
