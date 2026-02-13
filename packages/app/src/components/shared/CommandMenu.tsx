'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Trophy,
  Radio,
  Vault,
  User,
  FileText,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@sapience/ui/components/ui/command';
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

  // Reset search when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setDebouncedSearch('');
    }
  }, [open]);

  const nowSec = Math.floor(Date.now() / 1000);

  const { questions } = useInfiniteQuestions({
    take: 20,
    chainId: CHAIN_ID_ETHEREAL,
    sortField: 'endTime',
    sortDirection: 'asc',
    search: debouncedSearch || undefined,
    minEndTime: nowSec,
  });

  // Flatten questions into displayable condition rows
  const conditionRows = React.useMemo(() => {
    if (!questions) return [];
    return questions.flatMap((q) => {
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
    }).slice(0, 10);
  }, [questions]);

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="mx-auto w-full max-w-lg">
        <CommandInput
          placeholder="Search questions, pages..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {conditionRows.length > 0 && (
            <CommandGroup heading="Questions">
              {conditionRows.map((condition) => {
                const categorySlug = condition.category?.slug || '';
                const categoryColor = getDeterministicCategoryColor(categorySlug);
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

          <CommandSeparator />

          <CommandGroup heading="Pages">
            {PAGES.map((page) => (
              <CommandItem
                key={page.href}
                value={page.name}
                onSelect={() => handleSelect(page.href)}
              >
                <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{page.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}
