'use client';

import * as React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';

export type ResolutionStatusFilterValue =
  | 'all'
  | 'resolved'
  | 'resolvedYes'
  | 'resolvedNo'
  | 'unresolved';

const OPTIONS: { value: ResolutionStatusFilterValue; label: string }[] = [
  { value: 'all', label: 'All Markets' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'resolvedYes', label: 'Resolved Yes' },
  { value: 'resolvedNo', label: 'Resolved No' },
  { value: 'unresolved', label: 'Unresolved' },
];

interface ResolutionStatusFilterProps {
  value: ResolutionStatusFilterValue;
  onChange: (value: ResolutionStatusFilterValue) => void;
}

export default function ResolutionStatusFilter({
  value,
  onChange,
}: ResolutionStatusFilterProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOption =
    OPTIONS.find((opt) => opt.value === value) ?? OPTIONS[0];

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
      <PopoverContent className="w-[180px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer flex items-center justify-between"
                >
                  <span>{option.label}</span>
                  <Check
                    className={cn(
                      'h-4 w-4',
                      value === option.value
                        ? 'opacity-100 text-amber-400'
                        : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
