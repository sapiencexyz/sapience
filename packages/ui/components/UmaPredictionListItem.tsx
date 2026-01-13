'use client';

import * as React from 'react';

import { PredictionChoiceBadge } from './predictions/PredictionChoiceBadge';

export type UmaPrediction = {
  id: string;
  conditionId?: string;
  question: string;
  prediction: boolean; // true = YES, false = NO
  categorySlug?: string | null;
};

export type UmaPredictionListItemProps = {
  prediction: UmaPrediction;
  /**
   * Optional leading element (typically the circular category icon).
   * If not provided, falls back to a generic UMA icon.
   */
  leading?: React.ReactNode;
  /**
   * Optional override for the title area. Useful for callers that want to render
   * a link component (e.g. Next.js).
   */
  title?: React.ReactNode;
  onRemove?: (id: string) => void;
  yesLabel?: string;
  noLabel?: string;
};

export function UmaPredictionListItem({
  prediction,
  leading,
  title,
  onRemove,
  yesLabel = 'YES',
  noLabel = 'NO',
}: UmaPredictionListItemProps) {
  return (
    <div className="flex items-center gap-2">
      {leading ?? (
        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-brand-white/10">
          <img src="/uma.svg" alt="UMA" className="w-4 h-4" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-md text-foreground">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              {title ?? (
                <div className="truncate text-brand-white font-mono">
                  {prediction.question}
                </div>
              )}
            </div>
            <span className="shrink-0">
              <PredictionChoiceBadge
                choice={prediction.prediction ? yesLabel : noLabel}
              />
            </span>
          </div>
        </div>
      </div>

      {onRemove ? (
        <button
          onClick={() => onRemove(prediction.id)}
          className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
          type="button"
          aria-label="Remove"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}


