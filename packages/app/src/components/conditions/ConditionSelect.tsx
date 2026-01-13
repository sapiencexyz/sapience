import React from 'react';
import { useMemo, useState } from 'react';
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
import { Input } from '@sapience/ui/components/ui/input';
import { SearchIcon } from 'lucide-react';
import MarketBadge from '~/components/markets/MarketBadge';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

interface ConditionSelectProps {
  selectedConditionId?: string | null;
  onSelect: (condition: ConditionType) => void;
  className?: string;
}

const ConditionSelect: React.FC<ConditionSelectProps> = ({
  onSelect,
  className,
}) => {
  const { data: conditions = [], isLoading } = useConditions({
    chainId: DEFAULT_CHAIN_ID,
  });
  const [search, setSearch] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const nowSec = Math.floor(Date.now() / 1000);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conditions
      .filter((c) => c.public && c.endTime > nowSec)
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.shortName || ''} ${c.question || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.endTime - b.endTime);
  }, [conditions, search, nowSec]);

  return (
    <div className={className || ''}>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none z-10" />
          <Input
            ref={inputRef}
            placeholder="Search questions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="pl-9 h-12 text-base md:text-lg"
          />
          <PopoverTrigger asChild>
            <div className="absolute inset-0 pointer-events-none" aria-hidden />
          </PopoverTrigger>
        </div>
        <PopoverContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="min-w-[var(--radix-popover-trigger-width)] w-[360px] p-0 bg-brand-black text-brand-white font-mono"
          align="start"
        >
          {isLoading ? (
            <div className="py-3 px-3 text-sm opacity-75">Loading…</div>
          ) : (
            <Command>
              <CommandList>
                {filtered.length === 0 ? (
                  <CommandEmpty className="py-4 text-center text-sm opacity-75">
                    No active conditions found.
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filtered.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => {
                          onSelect(c);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2 text-brand-white transition-colors duration-200 ease-out hover:bg-brand-white/10 data-[highlighted]:bg-brand-white/10 data-[highlighted]:text-brand-white cursor-pointer"
                      >
                        {(() => {
                          const categorySlug = c.category?.slug || '';
                          const fa = FOCUS_AREAS.find(
                            (fa) => fa.id === categorySlug
                          );
                          const color =
                            fa?.color ||
                            getDeterministicCategoryColor(categorySlug);
                          return (
                            <MarketBadge
                              categorySlug={categorySlug}
                              label={c.shortName || c.question}
                              size={28}
                              color={color}
                            />
                          );
                        })()}
                        <div className="flex flex-col min-w-0">
                          <span className="truncate text-sm text-brand-white">
                            {c.shortName || c.question}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ConditionSelect;
