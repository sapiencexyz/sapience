import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { Loader2, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useSignMessage } from 'wagmi';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useToast } from '~/hooks/use-toast';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { useFoil } from '~/lib/context/FoilProvider';
import type { Market } from '~/lib/context/FoilProvider';
import { foilApi } from '~/lib/utils/util';

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

const AdminTable: React.FC = () => {
  const { markets, isLoading, refetchMarkets } = useFoil();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'endTimestamp', desc: true },
  ]);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const [missingBlocks, setMissingBlocks] = useState<MissingBlocks>({});

  const data = useMemo(() => {
    return markets.flatMap((market) =>
      market.epochs.map((epoch) => ({
        ...epoch,
        market,
        marketAddress: market.address,
        vaultAddress: market.owner,
        chainId: market.chainId,
        isPublic: market.public,
      }))
    );
  }, [markets]);

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

      const response = await foilApi.post('/reindexMissingBlocks', {
        chainId,
        address: marketAddress,
        epochId,
        model: reindexType === 'price' ? 'ResourcePrice' : 'Event',
        signature,
        timestamp,
      });

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

  const updateMarketPrivacy = async (market: Market) => {
    setLoadingAction((prev) => ({ ...prev, [market.address]: true }));
    const timestamp = Date.now();

    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });
    const response = await foilApi.post('/updateMarketPrivacy', {
      address: market.address,
      chainId: market.chainId,
      signature,
      timestamp,
    });
    if (response.success) {
      await refetchMarkets();
    }
    setLoadingAction((prev) => ({ ...prev, [market.address]: false }));
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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2">Loading Markets...</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer"
                >
                  <span className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <span className="ml-2 inline-block">
                      {renderSortIcon(header.column.getIsSorted())}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AdminTable;
