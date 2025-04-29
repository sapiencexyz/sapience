import { TimeInterval } from '../../types/charts';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface IntervalSelectorProps {
  selectedInterval: TimeInterval;
  setSelectedInterval: (interval: TimeInterval) => void;
}

// Helper to get display text for intervals
const intervalLabels: Record<TimeInterval, string> = {
  [TimeInterval.I5M]: '5m',
  [TimeInterval.I15M]: '15m',
  [TimeInterval.I30M]: '30m',
  [TimeInterval.I4H]: '4h',
  [TimeInterval.I1D]: '1d',
};

export const IntervalSelector = ({
  selectedInterval,
  setSelectedInterval,
}: IntervalSelectorProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center justify-between"
        >
          <span className="mr-1">{intervalLabels[selectedInterval]}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(intervalLabels).map(([intervalKey, label]) => (
          <DropdownMenuItem
            key={intervalKey}
            onClick={() => setSelectedInterval(intervalKey as TimeInterval)}
            className={cn(
              'text-sm px-2 py-1.5',
              selectedInterval === intervalKey
                ? 'bg-accent text-accent-foreground'
                : ''
            )}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
