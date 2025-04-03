import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Loader2, ChevronDown, ChevronUp, ArrowUpDown, Eye, Filter, FilterX, X, Activity, Share2, Network, Boxes, GitBranch, Layers, CircuitBoard } from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { useSignMessage } from 'wagmi';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '~/hooks/use-toast';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { useFoil } from '~/lib/context/FoilProvider';
import type { Market } from '~/lib/context/FoilProvider';
import { foilApi } from '~/lib/utils/util';
import { cn } from '~/lib/utils';

import getColumns from './columns';
import type { MissingBlocks } from './types';

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

// Filter option types
interface FilterCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  options: FilterOption[];
}

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
  const { markets, isLoading, refetchMarkets } = useFoil();
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
    { id: 'isPublic', label: 'Public', value: 'true', icon: <Eye className="h-4 w-4" /> },
  ]);

  const data = useMemo(() => {
    return markets.flatMap((market) =>
      market.epochs.map((epoch) => ({
        ...epoch,
        market,
        marketAddress: market.address,
        vaultAddress: market.owner,
        chainId: market.chainId,
      }))
    );
  }, [markets]);

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
      if (now < startTime) status = '1'; // Pre-Period Trading
      else if (now < endTime) status = '2'; // Active Trading
      else {
        // Check for assertionId and settled properties in market data
        const settled = 'settled' in item ? (item as any).settled : false;
        const assertionId = 'assertionId' in item ? (item as any).assertionId : null;
        
        if (!settled) status = assertionId ? '3' : '4'; // Submitted to UMA or Needs Settlement
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
      '5': 'Settled'
    };
    
    const statusColors: Record<string, string> = {
      '1': 'text-blue-500',
      '2': 'text-green-500',
      '3': 'text-purple-500',
      '4': 'text-orange-500',
      '5': 'text-gray-500'
    };
    
    return Array.from(uniqueStatuses).sort().map(status => ({
      id: 'status',
      label: statusLabels[status] || `Status ${status}`,
      value: status,
      icon: <Activity className={`h-4 w-4 ${statusColors[status]}`} />
    }));
  }, [data]);
  
  // Dynamically generate chain options based on available data
  const chainOptions = useMemo(() => {
    if (!data.length) return [];
    
    // Get unique chain IDs from data
    const uniqueChainIds = new Set<number>();
    data.forEach(item => uniqueChainIds.add(item.chainId));
    
    // Map chain IDs to display options
    const chainLabels: Record<number, string> = {
      1: 'Ethereum',
      8453: 'Base',
      11155111: 'Sepolia'
    };
    
    const chainColors: Record<number, string> = {
      1: '',
      8453: 'text-blue-500',
      11155111: 'text-gray-500'
    };
    
    return Array.from(uniqueChainIds).sort().map(chainId => ({
      id: 'chainId',
      label: chainLabels[chainId] || `Chain ${chainId}`,
      value: chainId.toString(),
      icon: <Boxes className={`h-4 w-4 ${chainColors[chainId]}`} />
    }));
  }, [data]);

  // Public filter option
  const publicFilterOption = { id: 'isPublic', label: 'Public', value: 'true', icon: <Eye className="h-4 w-4" /> };

  const fetchMissingBlocks = async (market: Market, epochId: number) => {
    try {
      const data = await foilApi.get(
        `/missing-blocks?chainId=${market.chainId}&address=${market.address}&epochId=${epochId}`
      );

      setMissingBlocks((prev) => ({
        ...prev,
        [`${market.address}-${epochId}`]: {
          resourcePrice: data.missingBlockNumbers,
        },
      }));
    } catch (error) {
      console.error('Error fetching missing blocks:', error);
    }
  };

  React.useEffect(() => {
    if (!isLoading && markets.length > 0) {
      markets.forEach((market) => {
        market.epochs.forEach((epoch) => {
          fetchMissingBlocks(market, epoch.epochId);
        });
      });
    }
  }, [markets, isLoading]);

  const handleReindex = async (
    reindexType: 'price' | 'events',
    marketAddress: string,
    epochId: number,
    chainId: number
  ) => {
    try {
      setLoadingAction((prev) => ({
        ...prev,
        [`reindex-${marketAddress}-${epochId}-${reindexType}`]: true,
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
          epochId,
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
        const market = markets.find((m) => m.address === marketAddress);
        if (market) {
          fetchMissingBlocks(market, epochId);
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
        [`reindex-${marketAddress}-${epochId}-${reindexType}`]: false,
      }));
    }
  };

  const updateMarketPrivacy = async (market: Market, epochId: number) => {
    setLoadingAction((prev) => ({
      ...prev,
      [`${market.address}-${epochId}`]: true,
    }));
    const timestamp = Date.now();

    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });
    const response = await foilApi.post('/updateMarketPrivacy', {
      address: market.address,
      chainId: market.chainId,
      epochId,
      signature,
      timestamp,
    });
    if (response.success) {
      await refetchMarkets();
    }
    setLoadingAction((prev) => ({
      ...prev,
      [`${market.address}-${epochId}`]: false,
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

  const toggleFilter = (filter: FilterOption) => {
    // Check if this filter is already selected
    const isSelected = selectedFilters.some(
      f => f.id === filter.id && f.value === filter.value
    );
    
    let newFilters: FilterOption[];
    let newColumnFilters: ColumnFiltersState;
    
    if (isSelected) {
      // Remove the filter
      newFilters = selectedFilters.filter(
        f => !(f.id === filter.id && f.value === filter.value)
      );
      
      // Special handling for multiOption filters like chainId
      if (filter.id === 'chainId') {
        const existingChainFilter = columnFilters.find(f => f.id === 'chainId');
        if (existingChainFilter && Array.isArray(existingChainFilter.value)) {
          const newChainValues = (existingChainFilter.value as string[]).filter(
            v => v !== filter.value
          );
          
          newColumnFilters = columnFilters.map(f => 
            f.id === 'chainId' ? { ...f, value: newChainValues } : f
          ).filter(f => f.id !== 'chainId' || (Array.isArray(f.value) && f.value.length > 0));
        } else {
          newColumnFilters = columnFilters.filter(f => f.id !== filter.id);
        }
      } else {
        // Simple filter
        newColumnFilters = columnFilters.filter(f => !(f.id === filter.id && f.value === filter.value));
      }
    } else {
      // Add the filter
      if (filter.id === 'isPublic') {
        // Public is exclusive - replace any existing public filter
        newFilters = [
          ...selectedFilters.filter(f => f.id !== 'isPublic'),
          filter
        ];
        
        // Update column filters for public
        newColumnFilters = [
          ...columnFilters.filter(f => f.id !== 'isPublic'),
          { id: 'isPublic', value: filter.value }
        ];
      } else if (filter.id === 'status') {
        // Status is exclusive - replace any existing status filter
        newFilters = [
          ...selectedFilters.filter(f => f.id !== 'status'),
          filter
        ];
        
        newColumnFilters = [
          ...columnFilters.filter(f => f.id !== 'status'),
          { id: 'status', value: filter.value }
        ];
      } else if (filter.id === 'chainId') {
        // Chain is multiOption - add to existing chain filters
        newFilters = [
          ...selectedFilters.filter(f => f.id !== filter.id || f.value !== filter.value),
          filter
        ];
        
        // Find existing chain filter
        const existingChainFilter = columnFilters.find(f => f.id === 'chainId');
        if (existingChainFilter && Array.isArray(existingChainFilter.value)) {
          // Add to existing values
          const newChainValues = [...existingChainFilter.value, filter.value];
          
          newColumnFilters = columnFilters.map(f => 
            f.id === 'chainId' ? { ...f, value: newChainValues } : f
          );
        } else {
          // Create new filter
          newColumnFilters = [
            ...columnFilters.filter(f => f.id !== 'chainId'),
            { id: 'chainId', value: [filter.value] }
          ];
        }
      } else {
        // For any other filter type
        newFilters = [...selectedFilters, filter];
        newColumnFilters = [...columnFilters, { id: filter.id, value: filter.value }];
      }
    }
    
    setSelectedFilters(newFilters);
    setColumnFilters(newColumnFilters);
  };
  
  const resetFilters = () => {
    setSelectedFilters([]);
    setColumnFilters([]);
  };

  const table = useReactTable({
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

  // Initialize selected filters based on default filters
  useEffect(() => {
    // Only run if we have chain options but no selected filters at all
    if (chainOptions.length > 0 && selectedFilters.length === 0) {
      // Set initial selected filters - only public filter
      setSelectedFilters([publicFilterOption]);
      
      // Set initial column filters - only public filter
      setColumnFilters([
        { id: 'isPublic', value: 'true' }
      ]);
    }
  }, [chainOptions, publicFilterOption]);

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
                            f => f.id === publicFilterOption.id && f.value === publicFilterOption.value
                          )}
                          className="mr-2 h-4 w-4"
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
                              f => f.id === option.id && f.value === option.value
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
                            f => f.id === option.id && f.value === option.value
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
                <Badge 
                  key={`${filter.id}-${filter.value}`} 
                  variant="outline"
                  className="h-8 px-3 gap-1 bg-secondary/10"
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 -ml-0.5 p-0 hover:bg-transparent"
                    onClick={() => toggleFilter(filter)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
          
          {toolButtons && (
            <div className="flex items-center gap-2">
              {toolButtons}
            </div>
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
                  <TableCell key={cell.id} className="h-9 py-0 px-3 text-xs align-middle">
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
