import { InfoIcon } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';

interface ForecastInfoNoticeProps {
  className?: string;
  text?: string;
}

export default function ForecastInfoNotice({
  className,
  text = 'A forecast includes a comment instead of a wager.',
}: ForecastInfoNoticeProps) {
  return (
    <div
      className={cn(
        'text-sm text-muted-foreground flex items-center gap-1.5',
        className
      )}
    >
      <InfoIcon className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}
