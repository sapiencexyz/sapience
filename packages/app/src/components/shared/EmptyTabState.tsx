import type { ReactNode } from 'react';

type EmptyTabStateProps = {
  message?: ReactNode;
  className?: string;
  centered?: boolean;
};

export default function EmptyTabState({
  message = 'None found',
  className = '',
  centered = false,
}: EmptyTabStateProps) {
  return (
    <div
      className={`text-center text-muted-foreground py-16 font-mono uppercase ${
        centered
          ? 'w-full min-h-[200px] flex flex-col items-center justify-center'
          : ''
      } ${className}`}
    >
      {message}
    </div>
  );
}
