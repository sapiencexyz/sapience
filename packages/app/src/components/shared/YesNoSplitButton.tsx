'use client';

import type { ReactNode } from 'react';
import { cn } from '~/lib/utils/util';

interface YesNoSplitButtonProps {
  onYes: () => void;
  onNo: () => void;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  // When true, visually mark the corresponding side as selected
  selectedYes?: boolean;
  selectedNo?: boolean;
  // Optional sublabels to render beneath the primary labels
  yesOddsText?: string;
  noOddsText?: string;
  // Optional custom primary labels
  yesLabel?: ReactNode;
  noLabel?: ReactNode;
  // Optional class applied to the primary label text
  labelClassName?: string;
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
  fullWidth = true,
  selectedYes,
  selectedNo,
  yesOddsText,
  noOddsText,
  yesLabel,
  noLabel,
  labelClassName,
}: YesNoSplitButtonProps) {
  const hasOdds = Boolean(yesOddsText || noOddsText);
  const sizeClasses =
    size === 'sm'
      ? 'h-8 text-sm'
      : size === 'md'
        ? 'h-10 text-sm'
        : 'h-11 md:h-10 text-base';

  const common = cn(
    'px-4 font-medium transition-all duration-200 ease-in-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none rounded-md border whitespace-nowrap tracking-wider',
    sizeClasses
  );

  return (
    <div
      className={cn(fullWidth ? 'flex w-full gap-3' : 'flex gap-3', className)}
    >
      <button
        type="button"
        onClick={onYes}
        disabled={disabled}
        className={cn(
          fullWidth ? 'flex-1' : 'w-auto',
          common,
          selectedYes
            ? 'text-emerald-900 dark:text-white/90 bg-emerald-500/50 hover:bg-emerald-500/60 dark:bg-emerald-500/70 dark:hover:bg-emerald-500/80 border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.35)] dark:shadow-[0_0_0_2px_rgba(16,185,129,0.45)]'
            : 'text-emerald-700 dark:text-white/90 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-400/60 shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),_0_0_10px_rgba(16,185,129,0.18)] dark:shadow-[0_0_0_1px_rgba(16,185,129,0.28)] dark:hover:shadow-[0_0_0_1px_rgba(16,185,129,0.4),_0_0_12px_rgba(16,185,129,0.3)]'
        )}
      >
        {hasOdds ? (
          <span className="flex flex-col items-center justify-center translate-y-[1px]">
            <span
              className={cn('leading-none whitespace-nowrap', labelClassName)}
            >
              {yesLabel ?? 'Yes'}
            </span>
            {yesOddsText ? (
              <span className="text-[8px] leading-none text-emerald-900/80 dark:text-white/80 mt-0.5">
                {yesOddsText}
              </span>
            ) : null}
          </span>
        ) : (
          <span className={cn(labelClassName)}>{yesLabel ?? 'Yes'}</span>
        )}
      </button>
      <button
        type="button"
        onClick={onNo}
        disabled={disabled}
        className={cn(
          fullWidth ? 'flex-1' : 'w-auto',
          common,
          selectedNo
            ? 'text-rose-900 dark:text-white/90 bg-rose-500/50 hover:bg-rose-500/60 dark:bg-rose-500/70 dark:hover:bg-rose-500/80 border-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.35)] dark:shadow-[0_0_0_2px_rgba(244,63,94,0.45)]'
            : 'text-rose-700 dark:text-white/90 bg-rose-500/10 hover:bg-rose-500/20 border-rose-400/60 shadow-[0_0_0_1px_rgba(244,63,94,0.18)] hover:shadow-[0_0_0_1px_rgba(244,63,94,0.28),_0_0_10px_rgba(244,63,94,0.18)] dark:shadow-[0_0_0_1px_rgba(244,63,94,0.28)] dark:hover:shadow-[0_0_0_1px_rgba(244,63,94,0.4),_0_0_12px_rgba(244,63,94,0.3)]'
        )}
      >
        {hasOdds ? (
          <span className="flex flex-col items-center justify-center translate-y-[1px]">
            <span
              className={cn('leading-none whitespace-nowrap', labelClassName)}
            >
              {noLabel ?? 'No'}
            </span>
            {noOddsText ? (
              <span className="text-[8px] leading-none text-rose-900/80 dark:text-white/80 mt-0.5">
                {noOddsText}
              </span>
            ) : null}
          </span>
        ) : (
          <span className={cn(labelClassName)}>{noLabel ?? 'No'}</span>
        )}
      </button>
    </div>
  );
}
