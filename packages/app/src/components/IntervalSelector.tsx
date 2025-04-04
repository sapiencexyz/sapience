import { Button } from '@foil/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { cn } from '@foil/ui/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { TimeInterval } from '~/lib/interfaces/interfaces';

const intervals = [
  { value: TimeInterval.I5M, label: '5m' },
  { value: TimeInterval.I15M, label: '15m' },
  { value: TimeInterval.I30M, label: '30m' },
  { value: TimeInterval.I4H, label: '4h' },
  { value: TimeInterval.I1D, label: '1d' },
] as const;

interface IntervalSelectorProps {
  selectedInterval: TimeInterval;
  setSelectedInterval: (interval: TimeInterval) => void;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const IntervalSelector = ({
  selectedInterval,
  setSelectedInterval,
  size,
}: IntervalSelectorProps) => {
  const [open, setOpen] = useState(false);

  const selectedIntervalLabel = intervals.find(
    (interval) => interval.value === selectedInterval
  )?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size={size ?? 'default'}
          className="justify-between"
        >
          {selectedIntervalLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[100px] p-2">
        <div className="flex flex-col gap-1">
          {intervals.map((interval) => (
            <Button
              key={interval.value}
              variant="ghost"
              className={cn(
                'justify-start gap-2',
                selectedInterval === interval.value && 'bg-accent'
              )}
              onClick={() => {
                setSelectedInterval(interval.value);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  'h-4 w-4',
                  selectedInterval === interval.value
                    ? 'opacity-100'
                    : 'opacity-0'
                )}
              />
              {interval.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default IntervalSelector;
