'use client';

import * as React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';

export interface StatusOption<T extends string = string> {
  value: T;
  label: string;
}

interface StatusFilterProps<T extends string = string> {
  options: StatusOption<T>[];
  selected: T[];
  onChange: (values: T[]) => void;
  placeholder: string;
  allLabel?: string;
}

export function StatusFilter<T extends string = string>({
  options,
  selected,
  onChange,
  placeholder,
  allLabel = 'All',
}: StatusFilterProps<T>) {
  const [open, setOpen] = React.useState(false);

  const handleToggle = (value: T) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const getButtonLabel = () => {
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length === 1) {
      const opt = options.find((o) => o.value === selected[0]);
      return opt?.label || selected[0];
    }
    if (selected.length === options.length) {
      return placeholder;
    }
    return `${selected.length} selected`;
  };

  const isAllSelected =
    selected.length === 0 || selected.length === options.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between px-3 text-sm"
        >
          <span
            className={selected.length === 0 ? 'text-muted-foreground' : ''}
          >
            {getButtonLabel()}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={handleSelectAll}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">{allLabel}</span>
                <Check
                  className={cn(
                    'h-4 w-4',
                    isAllSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
                  )}
                />
              </CommandItem>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleToggle(option.value)}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <span>{option.label}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default StatusFilter;
