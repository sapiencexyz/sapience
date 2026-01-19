'use client';

import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '~/lib/utils/util';
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
  CommandInput,
} from '@sapience/ui/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

export type MultiSelectItem = { value: string; label: string };

type Props = {
  placeholder: string;
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  enableSearch?: boolean;
  renderTriggerContent?: (
    selectedValues: string[],
    items: MultiSelectItem[]
  ) => React.ReactNode;
  emptyMessage?: string;
  renderItemContent?: (
    item: MultiSelectItem,
    isSelected: boolean
  ) => React.ReactNode;
  alwaysShowPlaceholder?: boolean;
  size?: 'default' | 'compact';
  matchTriggerWidth?: boolean;
  closeOnSelect?: boolean;
  /** Render custom header content above the list (e.g., an input for adding items) */
  renderHeader?: (props: {
    selected: string[];
    onChange: (values: string[]) => void;
  }) => React.ReactNode;
};

const MultiSelect: React.FC<Props> = ({
  placeholder,
  items,
  selected,
  onChange,
  className,
  enableSearch,
  renderTriggerContent,
  emptyMessage,
  renderItemContent,
  alwaysShowPlaceholder = false,
  size = 'compact',
  matchTriggerWidth = false,
  closeOnSelect = false,
  renderHeader,
}) => {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Manually handle scrolling to bypass Dialog's scroll lock
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;

    // Prevent the event from reaching Dialog's scroll lock
    e.stopPropagation();

    // Manually scroll the container
    el.scrollTop += e.deltaY;
  }, []);

  const triggerContent = useMemo(() => {
    if (alwaysShowPlaceholder || selected.length === 0) return placeholder;
    if (renderTriggerContent) return renderTriggerContent(selected, items);
    return `${selected.length} selected`;
  }, [
    alwaysShowPlaceholder,
    placeholder,
    renderTriggerContent,
    selected,
    items,
  ]);

  const sizeClasses =
    size === 'default' ? 'h-10 px-3 py-2 text-sm' : 'h-8 px-3 text-sm';

  const toggle = useCallback(
    (value: string) => {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value]
      );
      if (closeOnSelect) {
        setOpen(false);
      }
    },
    [closeOnSelect, onChange, selected]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full rounded-md border border-border bg-background text-left inline-flex items-center justify-between',
            sizeClasses,
            className
          )}
        >
          <span
            className={
              selected.length === 0 || alwaysShowPlaceholder
                ? 'text-muted-foreground'
                : ''
            }
          >
            {triggerContent}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0',
          matchTriggerWidth ? 'w-[--radix-popover-trigger-width]' : 'w-[280px]'
        )}
        align="start"
      >
        <Command className="flex flex-col overflow-visible">
          {renderHeader && renderHeader({ selected, onChange })}
          {enableSearch && (
            <div className="relative">
              <CommandInput placeholder="Search…" />
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  CLEAR
                </button>
              )}
            </div>
          )}
          <div
            ref={listRef}
            className="max-h-[300px] overflow-y-auto overscroll-contain"
            onWheel={handleWheel}
          >
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty className="pt-4 pb-2 text-center text-sm text-muted-foreground">
                {emptyMessage || 'No options'}
              </CommandEmpty>
              <CommandGroup>
                {items.map((it) => {
                  const isSelected = selected.includes(it.value);
                  return (
                    <CommandItem
                      key={it.value}
                      onSelect={() => toggle(it.value)}
                      className="flex items-center justify-between"
                    >
                      <span className="inline-flex items-center gap-2">
                        {renderItemContent
                          ? renderItemContent(it, isSelected)
                          : it.label}
                      </span>
                      <Check
                        className={
                          isSelected
                            ? 'h-4 w-4 opacity-100 text-amber-400'
                            : 'h-4 w-4 opacity-0'
                        }
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelect;
