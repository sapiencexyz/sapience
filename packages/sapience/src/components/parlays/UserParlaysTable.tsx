'use client';

import type { Address } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import * as React from 'react';

export default function UserParlaysTable({
  showHeaderText = true,
}: {
  account: Address;
  chainId?: number;
  showHeaderText?: boolean;
  marketAddressFilter?: string;
}) {
  type MockLeg = { question: string; choice: 'Yes' | 'No' };
  type MockParlay = {
    positionId: number;
    legs: MockLeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // timestamp in ms
    status: 'active' | 'won' | 'lost';
  };

  const mockParlays: MockParlay[] = [
    {
      positionId: 101234,
      direction: 'Long',
      endsAt: Date.now() + 1000 * 60 * 60 * 3, // 3d (rounded display)
      status: 'active',
      legs: [
        { question: 'Will BTC close above $60k on Friday?', choice: 'Yes' },
        { question: 'Will the S&P 500 be up this week?', choice: 'No' },
      ],
    },
    {
      positionId: 101235,
      direction: 'Short',
      endsAt: Date.now() - 1000 * 60 * 60 * 2, // expired 2h ago
      status: 'won',
      legs: [
        { question: 'Will ETH average gas < 25 gwei tomorrow?', choice: 'Yes' },
        { question: 'Will US CPI YoY be above 3% next print?', choice: 'No' },
        {
          question: 'Will SOL flip BNB in market cap this month?',
          choice: 'No',
        },
      ],
    },
    {
      positionId: 101236,
      direction: 'Long',
      endsAt: Date.now() - 1000 * 60 * 5, // expired 5m ago
      status: 'lost',
      legs: [{ question: 'Will BTC dominance rise next week?', choice: 'Yes' }],
    },
  ];

  const columns = React.useMemo<ColumnDef<MockParlay>[]>(
    () => [
      {
        id: 'positionId',
        accessorFn: (row) => row.positionId,
        size: 120,
        minSize: 100,
        maxSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Position ID
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">#{row.original.positionId}</div>
        ),
      },
      {
        id: 'conditions',
        accessorFn: (row) => row.legs.length,
        size: 400,
        minSize: 300,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Conditions
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.legs.map((leg, idx) => (
              <div key={idx} className="text-sm">
                <span className="font-medium">{leg.question}</span>{' '}
                <span
                  className={
                    leg.choice === 'Yes' ? 'text-green-600' : 'text-red-600'
                  }
                >
                  ({leg.choice})
                </span>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: 'side',
        accessorFn: (row) => row.direction,
        size: 200,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Side
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {row.original.direction === 'Long'
              ? 'Conditions will be met'
              : 'Not all conditions will be met'}
          </div>
        ),
      },
      {
        id: 'endsAt',
        accessorFn: (row) => row.endsAt,
        size: 180,
        minSize: 150,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Status
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-left xl:text-right xl:mt-0">
            {row.original.status === 'active' && (
              <Button size="sm" variant="outline" disabled>
                {`Ends In ${Math.max(1, Math.ceil((row.original.endsAt - Date.now()) / (1000 * 60 * 60 * 24)))} Days`}
              </Button>
            )}
            {row.original.status === 'won' && (
              <Button size="sm">Claim Winnings</Button>
            )}
            {row.original.status === 'lost' && (
              <Button size="sm" variant="outline" disabled>
                Parlay Lost
              </Button>
            )}
          </div>
        ),
      },
    ],
    []
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'positionId', desc: true },
  ]);

  const table = useReactTable({
    data: mockParlays,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: false,
  });

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      <div className="rounded border">
        <Table className="table-fixed">
          <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === 'endsAt' ? 'text-right' : undefined
                    }
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`block xl:table-cell w-full px-0 py-0 xl:px-4 xl:py-3 ${cell.column.id === 'endsAt' ? 'text-left xl:text-right xl:mt-0' : ''}`}
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
