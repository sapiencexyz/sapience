import type { ReactNode } from 'react';

type EmptyTabStateProps = {
  message?: ReactNode;
  className?: string;
  centered?: boolean;
  /** Stretch the box to fill the viewport (minus header/profile/tabs/footer
   *  chrome). Used on profile-tab tables so the empty/loading panel doesn't
   *  hover over a sea of background. */
  fillViewport?: boolean;
};

export default function EmptyTabState({
  message = 'None found',
  className = '',
  centered = false,
  fillViewport = false,
}: EmptyTabStateProps) {
  const stretch = fillViewport
    ? 'w-full min-h-[calc(100svh-340px)] flex flex-col items-center justify-center'
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
