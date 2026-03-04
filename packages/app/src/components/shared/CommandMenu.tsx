'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  BarChart3,
  Trophy,
  Radio,
  Vault,
  User,
  FileText,
  Loader2,
  AlertCircle,
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
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { isAddress, getAddress } from 'viem';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import MarketBadge from '~/components/markets/MarketBadge';
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
    questions(
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
          openInterest
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
        openInterest
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

function getCategoryColor(categorySlug?: string | null): string {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
}

function useCommandMenuSearch(search: string | undefined, enabled: boolean) {
  return useQuery<ConditionType[]>({
    queryKey: ['commandMenuSearch', search],
    queryFn: async () => {
      const data = await graphqlRequest<{
        questions: QuestionResult[];
      }>(SEARCH_QUESTIONS, {
        // Overfetch 3x: groups expand into multiple rows, and we re-sort
        // client-side to prefer future markets over expired ones
        take: MAX_RESULTS * 3,
        chainId: DEFAULT_CHAIN_ID,
        search: search?.trim() || null,
      });

      const nowSec = Math.floor(Date.now() / 1000);
      return (data.questions ?? [])
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
        .sort((a, b) => {
          // 1. Prefer future markets over expired
          const aFuture = (a.endTime ?? 0) > nowSec ? 0 : 1;
          const bFuture = (b.endTime ?? 0) > nowSec ? 0 : 1;
          if (aFuture !== bFuture) return aFuture - bFuture;
          // 2. Prefer markets with open interest
          const aOI = BigInt(a.openInterest ?? '0') > 0n ? 0 : 1;
          const bOI = BigInt(b.openInterest ?? '0') > 0n ? 0 : 1;
          if (aOI !== bOI) return aOI - bOI;
          // 3. Nearest deadline first
          return (a.endTime ?? 0) - (b.endTime ?? 0);
        })
        .slice(0, MAX_RESULTS);
    },
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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
    isError,
  } = useCommandMenuSearch(debouncedSearch || undefined, open);

  // Filter pages client-side — use instant search for snappy UX
  const filteredPages = React.useMemo(() => {
    if (!search) return PAGES;
    const q = search.toLowerCase();
    return PAGES.filter((p) => p.name.toLowerCase().includes(q));
  }, [search]);

  // Detect Ethereum address for profile link
  const addressMatch = React.useMemo(() => {
    const trimmed = search.trim();
    if (isAddress(trimmed)) return getAddress(trimmed);
    return null;
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
    !isError &&
    debouncedSearch &&
    !addressMatch &&
    conditionRows.length === 0 &&
    filteredPages.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden p-0 shadow-lg max-w-2xl"
        hideCloseButton
      >
        <DialogTitle className="sr-only">Command Menu</DialogTitle>
        <DialogDescription className="sr-only">
          Search prediction markets, pages, and more
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search prediction markets and more..."
            value={search}
            onValueChange={setSearch}
            suffix={
              isSearching && search !== '' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : null
            }
          />
          <CommandList>
            {isError && !isSearching && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Something went wrong. Try again.
              </div>
            )}

            {hasNoResults && <CommandEmpty>No results found.</CommandEmpty>}

            {addressMatch && (
              <CommandGroup>
                <CommandItem
                  value={addressMatch}
                  onSelect={() => handleSelect(`/profile/${addressMatch}`)}
                  className="flex items-center gap-3"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-mono truncate">
                    {addressMatch}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {!isSearching && debouncedSearch && conditionRows.length > 0 && (
              <CommandGroup>
                {conditionRows.map((condition) => {
                  const categorySlug = condition.category?.slug || '';
                  const color = getCategoryColor(categorySlug);
                  const href = condition.resolver
                    ? `/questions/${condition.resolver}/${condition.id}`
                    : `/questions/${condition.id}`;

                  return (
                    <CommandItem
                      key={condition.id}
                      value={`${condition.shortName || condition.question} ${categorySlug}`}
                      onSelect={() => handleSelect(href)}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <MarketBadge
                        label={condition.question}
                        size={24}
                        color={color}
                        categorySlug={categorySlug || null}
                      />
                      <span className="text-sm font-mono text-brand-white truncate min-w-0 underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4">
                        {condition.question}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {filteredPages.length > 0 && (
              <>
                {!isSearching &&
                  debouncedSearch &&
                  conditionRows.length > 0 && <CommandSeparator />}
                <CommandGroup>
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
