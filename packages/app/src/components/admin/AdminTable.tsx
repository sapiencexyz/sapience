import { Button } from '@foil/ui/components/ui/button';
import { Checkbox } from '@foil/ui/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@foil/ui/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@foil/ui/components/ui/table';
import { useToast } from '@foil/ui/hooks/use-toast';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Eye,
  Filter,
  FilterX,
  X,
  Activity,
  Boxes,
} from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { useSignMessage } from 'wagmi';

import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { useFoil } from '~/lib/context/FoilProvider';
import type { MarketGroup } from '~/lib/context/FoilProvider';
import { foilApi } from '~/lib/utils/util';

import getColumns from './columns';
import type { TableRow as AdminTableRowData } from './columns';
import type { MissingBlocks } from './types';

// Define GraphQL Query for Total Volume
const TOTAL_VOLUME_BY_MARKET_QUERY = `
  query GetTotalVolumeByMarket($chainId: Int!, $marketAddress: String!, $marketId: Int!) {
    totalVolumeByMarket(chainId: $chainId, marketAddress: $marketAddress, marketId: $marketId)
  }
`;

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

interface FilterOption {
  id: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
}

interface AdminTableProps {
  toolButtons?: React.ReactNode;
}

const AdminTable: React.FC<AdminTableProps> = ({ toolButtons }) => {
  const { marketGroups, isLoading, refetchMarketGroups } = useFoil();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'endTimestamp', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: 'isPublic', value: 'true' },
  ]);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const [missingBlocks, setMissingBlocks] = useState<MissingBlocks>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<FilterOption[]>([
    {
      id: 'isPublic',
      label: 'Public',
      value: 'true',
      icon: <Eye className="h-4 w-4" />,
    },
  ]);
  // State for storing fetched volumes
  const [volumes, setVolumes] = useState<Record<string, number | null>>({}); // Key: marketAddress-chainId-marketId

  // Effect to fetch all volumes when markets data is available
  useEffect(() => {
    if (!isLoading && marketGroups.length > 0) {
      const fetchAllVolumes = async () => {
        const volumePromises = marketGroups.flatMap((marketGroup) =>
          marketGroup.markets.map(async (market) => {
            const key = `${marketGroup.address}-${marketGroup.chainId}-${market.marketId}`;
            try {
              const response = await foilApi.post('/graphql', {
                query: TOTAL_VOLUME_BY_MARKET_QUERY,
                variables: {
                  chainId: marketGroup.chainId,
                  marketAddress: marketGroup.address,
                  marketId: market.marketId,
                },
              });

              if (response.errors) {
                console.error(
                  `GraphQL Errors fetching volume for ${key}:`,
                  response.errors
                );
                return { key, volume: null }; // Mark as error/null
              }
              if (
                !response.data ||
                typeof response.data.totalVolumeByMarket !== 'number'
              ) {
                console.error(
                  `Volume data is not in the expected format for ${key}`
                );
                return { key, volume: null }; // Mark as error/null
              }
              return { key, volume: response.data.totalVolumeByMarket };
            } catch (error) {
              console.error(`Failed to fetch volume for ${key}:`, error);
              return { key, volume: null }; // Mark as error/null
            }
          })
        );

        const results = await Promise.all(volumePromises);
        const newVolumes: Record<string, number | null> = {};
        results.forEach(({ key, volume }) => {
          newVolumes[key] = volume;
        });
        setVolumes(newVolumes);
      };

      fetchAllVolumes();
    } else if (!isLoading && marketGroups.length === 0) {
      // Handle case where there are no markets
      setVolumes({});
    }
    // Intentionally excluding foilApi from dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketGroups, isLoading]);

  const data: AdminTableRowData[] = useMemo(() => {
    return marketGroups.flatMap((marketGroup) =>
      marketGroup.markets.map((market) => {
        const volumeKey = `${marketGroup.address}-${marketGroup.chainId}-${market.marketId}`;
        const volume = volumes[volumeKey]; // Get volume from state

        return {
          ...market,
          marketGroup, // Pass the whole market object
          marketGroupAddress: marketGroup.address,
          vaultAddress: marketGroup.owner, // Use owner as vaultAddress for display logic in columns
          chainId: marketGroup.chainId,
          settled: 'settled' in market ? (market as any).settled : false,
          assertionId:
            'assertionId' in market ? (market as any).assertionId : undefined,
          public: 'public' in market ? (market as any).public : false,
          volume, // Pass undefined if loading, null if error, or number if fetched
          id: 'id' in market ? (market as any).id : undefined, // Ensure id is passed if available
          question: 'question' in market ? (market as any).question : undefined, // Pass question if available
        };
      })
    );
  }, [marketGroups, volumes]); // Depend on volumes state now

  // Dynamically generate status options based on available data
  const statusOptions = useMemo(() => {
    if (!data.length) return [];

    // Get unique status values from data
    const uniqueStatuses = new Set<string>();
    const now = Math.floor(Date.now() / 1000);

    data.forEach((item) => {
      const startTime = item.startTimestamp;
      const endTime = item.endTimestamp;

      let status = '';
      if (now < startTime)
        status = '1'; // Pre-Period Trading
      else if (now < endTime)
        status = '2'; // Active Trading
      else {
        // Check for assertionId and settled properties in market data
        const settled = 'settled' in item ? (item as any).settled : false;
        const assertionId =
          'assertionId' in item ? (item as any).assertionId : null;

        if (!settled)
          status = assertionId ? '3' : '4'; // Submitted to UMA or Needs Settlement
        else status = '5'; // Settled
      }

      uniqueStatuses.add(status);
    });

    // Map status codes to display options
    const statusLabels: Record<string, string> = {
      '1': 'Pre-Period Trading',
      '2': 'Active Trading',
      '3': 'Submitted to UMA',
      '4': 'Needs Settlement',
      '5': 'Settled',
    };

    const statusColors: Record<string, string> = {
      '1': 'text-blue-500',
      '2': 'text-green-500',
      '3': 'text-purple-500',
      '4': 'text-orange-500',
      '5': 'text-gray-500',
    };

    return Array.from(uniqueStatuses)
      .sort()
      .map((status) => ({
        id: 'status',
        label: statusLabels[status] || `Status ${status}`,
        value: status,
        icon: <Activity className={`h-4 w-4 ${statusColors[status]}`} />,
      }));
  }, [data]);

  // Dynamically generate chain options based on available data
  const chainOptions = useMemo(() => {
    if (!data.length) return [];

    // Get unique chain IDs from data
    const uniqueChainIds = new Set<number>();
    data.forEach((item) => uniqueChainIds.add(item.chainId));

    // Map chain IDs to display options
    const chainLabels: Record<number, string> = {
      1: 'Ethereum',
      8453: 'Base',
      11155111: 'Sepolia',
    };

    const chainColors: Record<number, string> = {
      1: '',
      8453: 'text-blue-500',
      11155111: 'text-gray-500',
    };

    return Array.from(uniqueChainIds)
      .sort()
      .map((chainId) => ({
        id: 'chainId',
        label: chainLabels[chainId] || `Chain ${chainId}`,
        value: chainId.toString(),
        icon: <Boxes className={`h-4 w-4 ${chainColors[chainId]}`} />,
      }));
  }, [data]);

  // Public filter option
  const publicFilterOption = {
    id: 'isPublic',
    label: 'Public',
    value: 'true',
    icon: <Eye className="h-4 w-4" />,
  };

  const fetchMissingBlocks = async (
    marketGroup: MarketGroup,
    marketId: number
  ) => {
    try {
      const data = await foilApi.get(
        `/missing-blocks?chainId=${marketGroup.chainId}&address=${marketGroup.address}&marketId=${marketId}`
      );

      setMissingBlocks((prev) => ({
        ...prev,
        [`${marketGroup.address}-${marketId}`]: {
          resourcePrice: data.missingBlockNumbers,
        },
      }));
    } catch (error) {
      console.error('Error fetching missing blocks:', error);
    }
  };

  React.useEffect(() => {
    if (!isLoading && marketGroups.length > 0) {
      marketGroups.forEach((marketGroup) => {
        marketGroup.markets.forEach((market) => {
          fetchMissingBlocks(marketGroup, market.marketId);
        });
      });
    }
  }, [marketGroups, isLoading]);

  const handleReindex = async (
    reindexType: 'price' | 'events',
    marketAddress: string,
    marketId: number,
    chainId: number
  ) => {
    try {
      setLoadingAction((prev) => ({
        ...prev,
        [`reindex-${marketAddress}-${marketId}-${reindexType}`]: true,
      }));
      const timestamp = Date.now();

      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      const response = await foilApi.post(
        `/reindex/${reindexType === 'price' ? 'missing-prices' : 'market-events'}`,
        {
          chainId,
          address: marketAddress,
          marketId,
          signature,
          timestamp,
        }
      );

      if (response.success) {
        toast({
          title: 'Reindexing started',
          description: response.message,
          variant: 'default',
        });
        const marketGroup = marketGroups.find(
          (m) => m.address === marketAddress
        );
        if (marketGroup) {
          fetchMissingBlocks(marketGroup, marketId);
        }
      } else {
        toast({
          title: 'Reindexing failed',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.error('Error in handleReindex:', e);
      toast({
        title: 'Reindexing failed',
        description:
          e?.response?.data?.error || e.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoadingAction((prev) => ({
        ...prev,
        [`reindex-${marketAddress}-${marketId}-${reindexType}`]: false,
      }));
    }
  };

  const updateMarketPrivacy = async (
    marketGroup: MarketGroup,
    marketId: number
  ) => {
    setLoadingAction((prev) => ({
      ...prev,
      [`${marketGroup.address}-${marketId}`]: true,
    }));
    const timestamp = Date.now();

    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });
    const response = await foilApi.post('/updateMarketPrivacy', {
      address: marketGroup.address,
      chainId: marketGroup.chainId,
      marketId,
      signature,
      timestamp,
    });
    if (response.success) {
      await refetchMarketGroups();
    }
    setLoadingAction((prev) => ({
      ...prev,
      [`${marketGroup.address}-${marketId}`]: false,
    }));
  };

  const columns = useMemo(
    () =>
      getColumns(
        loadingAction,
        updateMarketPrivacy,
        handleReindex,
        missingBlocks
      ),
    [loadingAction, missingBlocks]
  );

  // Helper function to update the selected filters UI state
  const updateSelectedFiltersState = (
    currentSelected: FilterOption[],
    filter: FilterOption,
    isCurrentlySelected: boolean
  ): FilterOption[] => {
    const { id: filterId, value: filterValue } = filter;

    if (isCurrentlySelected) {
      // REMOVE logic
      if (filterId === 'isPublic' || filterId === 'status') {
        // Single-value filters: remove any existing filter with the same ID
        return currentSelected.filter((f) => f.id !== filterId);
      }
      // Multi-value filters (like chainId): remove the specific value
      return currentSelected.filter(
        (f) => !(f.id === filterId && f.value === filterValue)
      );
    }
    // ADD logic
    if (filterId === 'isPublic' || filterId === 'status') {
      // Single-value filters: replace any existing filter with the same ID
      return [...currentSelected.filter((f) => f.id !== filterId), filter];
    }
    // Multi-value filters (like chainId): add if not already present
    if (
      !currentSelected.some((f) => f.id === filterId && f.value === filterValue)
    ) {
      return [...currentSelected, filter];
    }
    return currentSelected; // No change if already exists for multi-value
  };

  // Helper function to update the table's column filters state
  const updateColumnFiltersState = (
    currentColumnFilters: ColumnFiltersState,
    filter: FilterOption,
    isCurrentlySelected: boolean
  ): ColumnFiltersState => {
    const { id: filterId, value: filterValue } = filter;

    if (isCurrentlySelected) {
      return removeFilterFromState(currentColumnFilters, filterId, filterValue);
    }
    return addFilterToState(currentColumnFilters, filterId, filterValue);
  };

  // Handle removal of filters from column filters state
  const removeFilterFromState = (
    currentColumnFilters: ColumnFiltersState,
    filterId: string,
    filterValue: string
  ): ColumnFiltersState => {
    // Single-value filters (isPublic, status)
    if (filterId === 'isPublic' || filterId === 'status') {
      return currentColumnFilters.filter((f) => f.id !== filterId);
    }

    // Handle chainId which is multi-value
    if (filterId === 'chainId') {
      return removeChainIdFilter(currentColumnFilters, filterValue);
    }

    // Default case for any other filter types
    return currentColumnFilters.filter(
      (f) => !(f.id === filterId && f.value === filterValue)
    );
  };

  // Handle removing a value from the chainId filter
  const removeChainIdFilter = (
    currentColumnFilters: ColumnFiltersState,
    filterValue: string
  ): ColumnFiltersState => {
    const existingFilter = currentColumnFilters.find((f) => f.id === 'chainId');

    if (!existingFilter || !Array.isArray(existingFilter.value)) {
      return currentColumnFilters.filter((f) => f.id !== 'chainId');
    }

    const newValues = existingFilter.value.filter((v) => v !== filterValue);

    if (newValues.length === 0) {
      return currentColumnFilters.filter((f) => f.id !== 'chainId');
    }

    return currentColumnFilters.map((f) =>
      f.id === 'chainId' ? { ...f, value: newValues } : f
    );
  };

  // Handle adding filters to column filters state
  const addFilterToState = (
    currentColumnFilters: ColumnFiltersState,
    filterId: string,
    filterValue: string
  ): ColumnFiltersState => {
    // Single-value filters (isPublic, status)
    if (filterId === 'isPublic' || filterId === 'status') {
      return [
        ...currentColumnFilters.filter((f) => f.id !== filterId),
        { id: filterId, value: filterValue },
      ];
    }

    // Handle chainId which is multi-value
    if (filterId === 'chainId') {
      return addChainIdFilter(currentColumnFilters, filterValue);
    }

    // Default case for any other filter types
    if (!currentColumnFilters.some((f) => f.id === filterId)) {
      return [...currentColumnFilters, { id: filterId, value: filterValue }];
    }

    return currentColumnFilters;
  };

  // Handle adding a value to the chainId filter
  const addChainIdFilter = (
    currentColumnFilters: ColumnFiltersState,
    filterValue: string
  ): ColumnFiltersState => {
    const existingFilter = currentColumnFilters.find((f) => f.id === 'chainId');

    if (existingFilter && Array.isArray(existingFilter.value)) {
      if (!existingFilter.value.includes(filterValue)) {
        const newValues = [...existingFilter.value, filterValue];
        return currentColumnFilters.map((f) =>
          f.id === 'chainId' ? { ...f, value: newValues } : f
        );
      }
      return currentColumnFilters; // Value already exists
    }

    // If chainId filter doesn't exist or isn't an array, create it
    return [
      ...currentColumnFilters.filter((f) => f.id !== 'chainId'),
      { id: 'chainId', value: [filterValue] },
    ];
  };

  const toggleFilter = (filter: FilterOption) => {
    const isCurrentlySelected = selectedFilters.some(
      (f) => f.id === filter.id && f.value === filter.value
    );

    setSelectedFilters((currentSelected) =>
      updateSelectedFiltersState(currentSelected, filter, isCurrentlySelected)
    );

    setColumnFilters((currentColumnFilters) =>
      updateColumnFiltersState(
        currentColumnFilters,
        filter,
        isCurrentlySelected
      )
    );
  };

  const resetFilters = () => {
    setSelectedFilters([]);
    setColumnFilters([]);
  };

  const table = useReactTable<AdminTableRowData>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin opacity-20" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b py-4 px-4 mb-0">
          <div className="flex items-center flex-wrap gap-4">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-3 bg-secondary/80 hover:bg-secondary"
                >
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search filters..." />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>

                    {/* Public filter option - displayed without a header */}
                    <CommandGroup>
                      <CommandItem
                        key={`${publicFilterOption.id}-${publicFilterOption.value}`}
                        onSelect={() => toggleFilter(publicFilterOption)}
                        className="flex items-center"
                      >
                        <Checkbox
                          checked={selectedFilters.some(
                            (f) =>
                              f.id === publicFilterOption.id &&
                              f.value === publicFilterOption.value
                          )}
                          className="mr-2 h-4 w-4 pointer-events-none"
                        />
                        {publicFilterOption.icon}
                        <span className="ml-2">{publicFilterOption.label}</span>
                      </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    {/* Status section */}
                    {statusOptions.length > 0 && (
                      <>
                        <CommandGroup heading="Status">
                          {statusOptions.map((option) => {
                            const isSelected = selectedFilters.some(
                              (f) =>
                                f.id === option.id && f.value === option.value
                            );

                            return (
                              <CommandItem
                                key={`${option.id}-${option.value}`}
                                onSelect={() => toggleFilter(option)}
                                className="flex items-center"
                              >
                                <Checkbox
                                  checked={isSelected}
                                  className="mr-2 h-4 w-4"
                                />
                                {option.icon}
                                <span className="ml-2">{option.label}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>

                        <div className="pt-2">
                          <CommandSeparator />
                        </div>
                      </>
                    )}

                    {/* Chain section */}
                    {chainOptions.length > 0 && (
                      <CommandGroup heading="Chain">
                        {chainOptions.map((option) => {
                          const isSelected = selectedFilters.some(
                            (f) =>
                              f.id === option.id && f.value === option.value
                          );

                          return (
                            <CommandItem
                              key={`${option.id}-${option.value}`}
                              onSelect={() => toggleFilter(option)}
                              className="flex items-center"
                            >
                              <Checkbox
                                checked={isSelected}
                                className="mr-2 h-4 w-4"
                              />
                              {option.icon}
                              <span className="ml-2">{option.label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}

                    {selectedFilters.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={resetFilters}
                            className="justify-center text-center"
                          >
                            <FilterX className="mr-2 h-4 w-4" />
                            Clear filters
                          </CommandItem>
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex flex-wrap gap-4">
              {selectedFilters.map((filter) => (
                <div
                  key={`${filter.id}-${filter.value}`}
                  className="flex items-center h-8 px-3 gap-1 border rounded-full bg-secondary/10 text-foreground"
                >
                  {filter.icon}
                  <span className="text-xs font-semibold">{filter.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 -ml-0.5 p-0 hover:bg-transparent"
                    onClick={() => toggleFilter(filter)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {toolButtons && (
            <div className="flex items-center gap-4">{toolButtons}</div>
          )}
        </div>
      </div>
      <Table className="w-fit min-w-full whitespace-nowrap">
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer px-3 text-xs font-medium h-9"
                >
                  <span className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <span className="ml-1 inline-block">
                      {renderSortIcon(header.column.getIsSorted())}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results found.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-b hover:bg-muted/20">
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="h-9 py-0 px-3 text-xs align-middle"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default AdminTable;
