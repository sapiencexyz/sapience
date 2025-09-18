'use client';

import type { Address } from 'viem';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import { usePredictionMarketWriteContract } from '~/hooks/blockchain/usePredictionMarketWriteContract';
const ZERO_REF_CODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
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
  account,
  showHeaderText = true,
}: {
  account: Address;
  showHeaderText?: boolean;
}) {
  type UILeg = { question: string; choice: 'Yes' | 'No' };
  type UIParlay = {
    positionId: number;
    legs: UILeg[];
    direction: 'Long' | 'Short';
    endsAt: number; // ms
    status: 'active' | 'won' | 'lost';
    tokenIdToClaim?: bigint;
  };

  // Fetch real data
  const { data } = useUserParlays({ address: String(account) });

  const viewer = String(account || '').toLowerCase();
  const rows: UIParlay[] = (data || []).map((p: any) => {
    const legs: UILeg[] = (p.predictedOutcomes || []).map((o: any) => ({
      question: o?.condition?.question || o.conditionId,
      choice: o.prediction ? 'Yes' : 'No',
    }));
    const endsAtSec =
      p.endsAt ||
      Math.max(
        0,
        ...(p.predictedOutcomes || []).map(
          (o: any) => o?.condition?.endTime || 0
        )
      );
    const userIsMaker =
      typeof p.maker === 'string' && p.maker.toLowerCase() === viewer;
    const userIsTaker =
      typeof p.taker === 'string' && p.taker.toLowerCase() === viewer;
    const isActive = p.status === 'active';
    const userWon =
      !isActive &&
      ((userIsMaker && p.makerWon === true) ||
        (userIsTaker && p.makerWon === false));
    const status: UIParlay['status'] = isActive
      ? 'active'
      : userWon
        ? 'won'
        : 'lost';
    const tokenIdToClaim = userWon
      ? userIsMaker
        ? BigInt(p.makerNftTokenId)
        : BigInt(p.takerNftTokenId)
      : undefined;
    return {
      positionId: p.makerNftTokenId ? Number(p.makerNftTokenId) : p.id,
      legs,
      direction: 'Long',
      endsAt: endsAtSec ? endsAtSec * 1000 : Date.now(),
      status,
      tokenIdToClaim,
    };
  });

  const columns = React.useMemo<ColumnDef<UIParlay>[]>(
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
            {row.original.status === 'won' &&
              row.original.tokenIdToClaim !== undefined && (
                <ClaimButton tokenId={row.original.tokenIdToClaim} />
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
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: false,
  });

  function ClaimButton({ tokenId }: { tokenId: bigint }) {
    const { burn, isPending } = usePredictionMarketWriteContract({
      successMessage: 'Claim submitted',
      fallbackErrorMessage: 'Claim failed',
    });
    return (
      <Button
        size="sm"
        onClick={() => burn(tokenId, ZERO_REF_CODE)}
        disabled={isPending}
      >
        {isPending ? 'Claiming...' : 'Claim Winnings'}
      </Button>
    );
  }

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
