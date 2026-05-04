import type { ReactNode } from 'react';

type EmptyTabStateProps = {
  message?: ReactNode;
  className?: string;
  centered?: boolean;
  /** Grow to fill the parent flex column. Caller must guarantee that the
   *  ancestor chain is `flex flex-col` with `flex-1` so this has a
   *  parent height to claim. */
  fill?: boolean;
};

export default function EmptyTabState({
  message = 'None found',
  className = '',
  centered = false,
  fill = false,
}: EmptyTabStateProps) {
  const stretch = fill
    ? 'w-full flex-1 flex flex-col items-center justify-center'
    : centered
      ? 'w-full min-h-[200px] flex flex-col items-center justify-center'
      : '';
  return (
    <div
      className={`text-center text-sm text-muted-foreground py-16 font-mono uppercase ${stretch} ${className}`}
    >
      {message}
    </div>
  );
}
