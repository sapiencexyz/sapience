import type { ReactNode } from 'react';

type EmptyTabStateProps = {
  message?: ReactNode;
  className?: string;
  centered?: boolean;
  /** Stretch the box to fill `100svh - viewportOffset` (px). Use this so
   *  the empty/loading panel covers the visible page area. The offset is
   *  per-consumer because the chrome above each consumer differs:
   *  profile's tab has ~340px of header + profile + tabs above it;
   *  /feed has only ~200px. */
  viewportOffset?: number;
};

export default function EmptyTabState({
  message = 'None found',
  className = '',
  centered = false,
  viewportOffset,
}: EmptyTabStateProps) {
  const stretch =
    viewportOffset !== undefined
      ? 'w-full flex flex-col items-center justify-center'
      : centered
        ? 'w-full min-h-[200px] flex flex-col items-center justify-center'
        : '';
  return (
    <div
      className={`text-center text-sm text-muted-foreground py-16 font-mono uppercase ${stretch} ${className}`}
      style={
        viewportOffset !== undefined
          ? { minHeight: `calc(100svh - ${viewportOffset}px)` }
          : undefined
      }
    >
      {message}
    </div>
  );
}
