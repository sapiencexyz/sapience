import { FrownIcon } from 'lucide-react';

type EmptyTabStateProps = {
  message?: string;
  className?: string;
};

export default function EmptyTabState({
  message = 'None found',
  className = '',
}: EmptyTabStateProps) {
  return (
    <div className={`text-center text-muted-foreground py-16 ${className}`}>
      <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
      {message}
    </div>
  );
}
