'use client';

import { cn } from '~/lib/utils/util';

interface YesNoSplitButtonProps {
  onYes: () => void;
  onNo: () => void;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Combined two-sided pill for Yes / No actions.
 * Subtle green (Yes) and red (No) tints with a shared border and divider.
 */
export default function YesNoSplitButton({
  onYes,
  onNo,
  className,
  disabled,
  size = 'lg',
}: YesNoSplitButtonProps) {
  const sizeClasses =
    size === 'sm'
      ? 'h-8 text-sm'
      : size === 'md'
        ? 'h-10 text-sm'
        : 'h-11 md:h-10 text-base';

  const common = cn(
    'flex-1 px-4 font-medium transition-all duration-200 ease-in-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
    sizeClasses
  );

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <button
        type="button"
        onClick={onYes}
        disabled={disabled}
        className={cn(
          common,
          'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20',
          'border border-emerald-400/50 hover:border-emerald-500/60 rounded-md'
        )}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={onNo}
        disabled={disabled}
        className={cn(
          common,
          'text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20',
          'border border-rose-400/50 hover:border-rose-500/50 rounded-md'
        )}
      >
        No
      </button>
    </div>
  );
}
