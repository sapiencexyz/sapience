'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Trophy,
  Radio,
  Vault,
  User,
  FileText,
  Loader2,
} from 'lucide-react';
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
  DialogDescription,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ConditionType } from '~/hooks/graphql/useConditions';

const MAX_RESULTS = 10;

const PAGES = [
  { name: 'Markets', href: '/markets', icon: BarChart3 },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { name: 'Feed', href: '/feed', icon: Radio },
  { name: 'Vaults', href: '/vaults', icon: Vault },
  { name: 'Profile', href: '/profile', icon: User },
  { name: 'Docs', href: 'https://docs.sapience.xyz', icon: FileText },
] as const;

/** Lightweight query — only fetches the fields the command palette needs */
const SEARCH_QUESTIONS = /* GraphQL */ `
  query CommandMenuSearch($take: Int!, $chainId: Int, $search: String) {
    questionsSorted(
      take: $take
      skip: 0
      chainId: $chainId
      sortField: "endTime"
      sortDirection: "asc"
      search: $search
    ) {
      questionType
      group {
        id
        name
        category {
          id
          name
          slug
        }
        conditions {
          id
          question
          shortName
          endTime
          resolver
          category {
            id
            name
            slug
          }
        }
      }
      condition {
        id
        question
        shortName
        endTime
        resolver
        category {
          id
          name
          slug
        }
      }
    }
  }
`;

type QuestionResult = {
  questionType: 'condition' | 'group';
  condition?: ConditionType | null;
  group?: {
    id: number;
    name: string;
    category?: { id: number; name: string; slug: string } | null;
    conditions: ConditionType[];
  } | null;
};

function formatEndTime(endTime: number): string {
  const nowSec = Math.floor(Date.now() / 1000);
  if (endTime <= nowSec) return 'Ended';
  const endDate = new Date(endTime * 1000);
  return `Ends in ${formatDistanceToNowStrict(endDate)}`;
}

function useCommandMenuSearch(search: string | undefined, enabled: boolean) {
  return useQuery<ConditionType[]>({
    queryKey: ['commandMenuSearch', search],
    queryFn: async () => {
      const data = await graphqlRequest<{
        questionsSorted: QuestionResult[];
      }>(SEARCH_QUESTIONS, {
        take: MAX_RESULTS * 2,
        chainId: CHAIN_ID_ETHEREAL,
        search: search?.trim() || null,
      });

      // Flatten to condition rows
      return (data.questionsSorted ?? [])
        .flatMap((q) => {
          if (q.questionType === 'condition' && q.condition) {
            return [q.condition];
          }
          if (q.questionType === 'group' && q.group?.conditions) {
            return q.group.conditions.map((gc) => ({
              ...gc,
              category: gc.category ?? q.group!.category,
            }));
          }
          return [];
        })
        .slice(0, MAX_RESULTS);
    },
    enabled,
    staleTime: 30_000,
  });
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

  const {
    data: conditionRows = [],
    isFetching,
  } = useCommandMenuSearch(debouncedSearch || undefined, open);

  // Filter pages client-side — use instant search for snappy UX
  const filteredPages = React.useMemo(() => {
    if (!search) return PAGES;
    const q = search.toLowerCase();
    return PAGES.filter((p) => p.name.toLowerCase().includes(q));
  }, [search]);

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

  const isSearching = debouncedSearch !== search || isFetching;
  const hasNoResults =
    !isSearching &&
    debouncedSearch &&
    conditionRows.length === 0 &&
    filteredPages.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl">
        <DialogTitle className="sr-only">Command Menu</DialogTitle>
        <DialogDescription className="sr-only">
          Search prediction markets, pages, and more
        </DialogDescription>
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
            {isSearching && debouncedSearch !== '' && (
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

            {filteredPages.length > 0 && (
              <>
                {!isSearching && conditionRows.length > 0 && (
                  <CommandSeparator />
                )}
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
