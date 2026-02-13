'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Trophy, Radio, Vault, User, FileText, Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@sapience/ui/components/ui/command';
import {
  Dialog,
  DialogContent,
} from '@sapience/ui/components/ui/dialog';
import { useInfiniteQuestions } from '~/hooks/graphql/useInfiniteQuestions';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import { formatDistanceToNowStrict } from 'date-fns';

const PAGES = [
  { name: 'Markets', href: '/markets', icon: BarChart3 },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { name: 'Feed', href: '/feed', icon: Radio },
  { name: 'Vaults', href: '/vaults', icon: Vault },
  { name: 'Profile', href: '/profile', icon: User },
  { name: 'Docs', href: 'https://docs.sapience.xyz', icon: FileText },
] as const;

function formatEndTime(endTime: number): string {
  const nowSec = Math.floor(Date.now() / 1000);
  if (endTime <= nowSec) return 'Ended';
  const endDate = new Date(endTime * 1000);
  return `Ends in ${formatDistanceToNowStrict(endDate)}`;
}

export default function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const router = useRouter();

  // Stable minEndTime — only recompute when dialog opens
  const [minEndTime, setMinEndTime] = React.useState(() =>
    Math.floor(Date.now() / 1000)
  );

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Listen for ⌘K / Ctrl+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset search when dialog closes, refresh minEndTime when it opens
  React.useEffect(() => {
    if (open) {
      setMinEndTime(Math.floor(Date.now() / 1000));
    } else {
      setSearch('');
      setDebouncedSearch('');
    }
  }, [open]);

  const { data: questions, isLoading } = useInfiniteQuestions({
    pageSize: 20,
    chainId: CHAIN_ID_ETHEREAL,
    sortField: 'endTime',
    sortDirection: 'asc',
    search: debouncedSearch || undefined,
    minEndTime,
  });

  // Flatten questions into displayable condition rows
  const conditionRows = React.useMemo(() => {
    if (!questions) return [];
    return questions
      .flatMap((q) => {
        if (q.questionType === 'condition' && q.condition) {
          return [q.condition];
        }
        if (q.questionType === 'group' && q.group?.conditions) {
          return q.group.conditions.map((gc) => ({
            ...gc,
            category: q.group!.category,
          }));
        }
        return [];
      })
      .slice(0, 10);
  }, [questions]);

  // Filter pages client-side when searching
  const filteredPages = React.useMemo(() => {
    if (!debouncedSearch) return PAGES;
    const q = debouncedSearch.toLowerCase();
    return PAGES.filter((p) => p.name.toLowerCase().includes(q));
  }, [debouncedSearch]);

  const handleSelect = React.useCallback(
    (href: string) => {
      setOpen(false);
      if (href.startsWith('http')) {
        window.open(href, '_blank');
      } else {
        router.push(href);
      }
    },
    [router]
  );

  const isSearching = debouncedSearch !== search || isLoading;
  const hasNoResults =
    !isSearching && conditionRows.length === 0 && filteredPages.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search prediction markets and more..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isSearching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}

            {hasNoResults && <CommandEmpty>No results found.</CommandEmpty>}

            {!isSearching && conditionRows.length > 0 && (
              <CommandGroup heading="Questions">
                {conditionRows.map((condition) => {
                  const categorySlug = condition.category?.slug || '';
                  const categoryColor =
                    getDeterministicCategoryColor(categorySlug);
                  const href = condition.resolver
                    ? `/questions/${condition.resolver}/${condition.id}`
                    : `/questions/${condition.id}`;

                  return (
                    <CommandItem
                      key={condition.id}
                      value={`${condition.shortName || condition.question} ${categorySlug}`}
                      onSelect={() => handleSelect(href)}
                      className="flex flex-col items-start gap-0.5 py-2.5"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: categoryColor }}
                        />
                        <span className="truncate text-sm font-medium">
                          {condition.shortName || condition.question}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground">
                        {condition.category?.name && (
                          <span>{condition.category.name}</span>
                        )}
                        {condition.category?.name && <span>·</span>}
                        <span>{formatEndTime(condition.endTime)}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!isSearching && filteredPages.length > 0 && (
              <>
                {conditionRows.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Pages">
                  {filteredPages.map((page) => (
                    <CommandItem
                      key={page.href}
                      value={page.name}
                      onSelect={() => handleSelect(page.href)}
                    >
                      <page.icon className="mr-2 h-4 w-4" />
                      <span>{page.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
