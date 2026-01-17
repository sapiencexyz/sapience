'use client';

import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Check, ChevronsUpDown, Info } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';

export type SignedFilterValue = 'all' | 'signed' | 'unsigned';

type SignedFilterProps = {
  value: SignedFilterValue;
  onChange: (value: SignedFilterValue) => void;
};

const OPTIONS: Array<{ value: SignedFilterValue; label: string }> = [
  { value: 'all', label: 'All Requests' },
  { value: 'signed', label: 'Signed Only' },
  { value: 'unsigned', label: 'Unsigned Only' },
];

function SignedFilter({
  value,
  onChange,
}: SignedFilterProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const selectedOption = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between px-3 text-sm"
        >
          <span className={value === 'all' ? 'text-muted-foreground' : ''}>
            {selectedOption.label}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-1" align="start">
        <div className="flex flex-col">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-muted/50 transition-colors',
                value === option.value && 'bg-muted/30'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {option.label}
                {option.value === 'signed' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs whitespace-nowrap">
                        Bidders typically prioritize signed requests
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <Check
                className={cn(
                  'h-4 w-4',
                  value === option.value
                    ? 'opacity-100 text-amber-400'
                    : 'opacity-0'
                )}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SignedFilter;
