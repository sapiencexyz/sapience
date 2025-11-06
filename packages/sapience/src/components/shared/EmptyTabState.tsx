import { FrownIcon } from 'lucide-react';
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
      className={`text-center text-muted-foreground py-16 ${
        centered
          ? 'w-full min-h-[50vh] md:min-h-[60vh] flex flex-col items-center justify-center'
          : ''
      } ${className}`}
    >
      <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
      {message}
    </div>
  );
}
