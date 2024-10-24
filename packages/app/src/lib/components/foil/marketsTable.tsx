'use client';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpDownIcon,
} from '@chakra-ui/icons';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  chakra,
  Button,
  Link,
} from '@chakra-ui/react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import * as React from 'react';

import { useMarketList } from '~/lib/context/MarketListProvider';

const MarketsTable = () => {
  const { markets } = useMarketList();
  console.log('markets=', markets);

  const data = React.useMemo(
    () =>
      markets
        .filter((market: any) => market.public)
        .flatMap((market: any) =>
          market.epochs.map((epoch: any) => {
            const startDate = new Date(epoch.startTimestamp * 1000);
            const endDate = new Date(epoch.endTimestamp * 1000);
            return {
              marketName: market.name,
              epochId: epoch.epochId,
              period: `${format(startDate, 'PPpp')} - ${format(
                endDate,
                'PPpp'
              )}`,
              startTimestamp: epoch.startTimestamp,
              settled:
                epoch.settlementPriceD18 > 0 ? epoch.settlementPriceD18 : 'No',
              chainId: market.chainId,
              marketAddress: market.address,
            };
          })
        ),
    [markets]
  );

  const columns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: 'Market Name',
        accessorKey: 'marketName',
      },
      {
        header: 'Epoch',
        accessorKey: 'epochId',
      },
      {
        header: 'Period',
        accessorKey: 'period',
        sortingFn: 'basic', // Ensure sorting is based on startTimestamp
      },
      {
        header: 'Settled',
        accessorKey: 'settled',
      },
    ],
    []
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  const renderSortIcon = (isSorted: string | false) => {
    if (isSorted === 'desc') {
      return <ChevronDownIcon aria-label="sorted descending" />;
    }
    if (isSorted === 'asc') {
      return <ChevronUpIcon aria-label="sorted ascending" />;
    }
    return <ArrowUpDownIcon aria-label="sortable" />;
  };

  return (
    <Table variant="simple" mt={4}>
      <Thead>
        {table.getHeaderGroups().map((headerGroup: any) => (
          <Tr key={headerGroup.id}>
            {headerGroup.headers.map((header: any) => {
              const { meta } = header.column.columnDef;
              return (
                <Th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  isNumeric={meta?.isNumeric}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  <chakra.span pl="4">
                    {renderSortIcon(header.column.getIsSorted())}
                  </chakra.span>
                </Th>
              );
            })}
            <Th />
          </Tr>
        ))}
      </Thead>
      <Tbody>
        {table.getRowModel().rows.map((row: any) => (
          <Tr key={row.id}>
            {row.getVisibleCells().map((cell: any) => {
              const { meta } = cell.column.columnDef;
              return (
                <Td key={cell.id} isNumeric={meta?.isNumeric}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Td>
              );
            })}
            <Td>
              <Link
                href={`/subscribe/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
              >
                <Button size="xs" colorScheme="gray" mr={2}>
                  Subscribe
                </Button>
              </Link>
              <Link
                href={`/trade/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
              >
                <Button size="xs" colorScheme="gray" mr={2}>
                  Trade
                </Button>
              </Link>
              <Link
                href={`/pool/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
              >
                <Button size="xs" colorScheme="gray">
                  Pool
                </Button>
              </Link>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default MarketsTable;
