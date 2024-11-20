import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ArrowUpDown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useContext, useState, useMemo } from 'react';

import MarketAddress from '../MarketAddress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';
import { calculatePnL } from '~/lib/util/positionUtil';

import NumberDisplay from './numberDisplay';

interface Props {
  params: {
    id: string;
    epoch: string;
  };
}

interface Position {
  positionId: string;
  chain?: {
    id: string;
  };
  address: string;
  isLP: boolean;
  owner: string;
}

const useEpochPositions = (marketId: string, epochId: string) => {
  return useQuery({
    queryKey: ['epochPositions', marketId, epochId],
    queryFn: async () => {
      // Get trader positions
      const traderResponse = await fetch(
        `${API_BASE_URL}/positions?contractId=${marketId}&isLP=false`
      );
      if (!traderResponse.ok) {
        throw new Error('Failed to fetch trader positions');
      }

      // Get LP positions
      const lpResponse = await fetch(
        `${API_BASE_URL}/positions?contractId=${marketId}&isLP=true`
      );
      if (!lpResponse.ok) {
        throw new Error('Failed to fetch LP positions');
      }

      const [traderPositions, lpPositions] = await Promise.all([
        traderResponse.json(),
        lpResponse.json(),
      ]);

      return [...traderPositions, ...lpPositions];
    },
  });
};

const PositionCell = ({ row }: { row: { original: Position } }) => (
  <Link
    href={`/positions/${row.original.chain?.id}:${row.original.address}/${row.original.positionId}`}
    className="text-primary underline"
  >
    #{row.original.positionId.toString()}
  </Link>
);

const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <>
    <NumberDisplay value={cell.getValue() as number} /> wstETH
  </>
);

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) =>
  cell.getValue() as string;

const Leaderboard = ({ params }: Props) => {
  const { pool } = useContext(MarketContext);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { data: positions, isLoading } = useEpochPositions(
    params.id,
    params.epoch
  );

  const columns = useMemo<ColumnDef<Position>[]>(
    () => [
      {
        id: 'rank',
        header: 'Rank',
        cell: ({ row }) => row.index + 1,
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.positionId,
        cell: PositionCell,
      },
      {
        id: 'owner',
        header: 'Owner',
        accessorFn: (row) => row.owner,
        cell: OwnerCell,
      },
      {
        id: 'pnl',
        header: 'Profit/Loss',
        accessorFn: (row) => calculatePnL(row, pool),
        cell: PnLCell,
      },
    ],
    [pool]
  );

  const allPositions = useMemo(() => {
    if (!positions) return [];
    return positions
      .map((position) => ({
        ...position,
        pnl: calculatePnL(position, pool),
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [positions, pool]);

  const table = useReactTable({
    data: allPositions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  const getSortIcon = (sortDirection: false | 'desc' | 'asc') => {
    if (sortDirection === 'desc') {
      return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
    }
    return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 w-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-screen-md mx-auto py-12">
      <h1 className="text-5xl font-bold mb-8 text-center">🏆 Leaderboard 🏆</h1>

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
                      {getSortIcon(header.column.getIsSorted())}
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

export default Leaderboard;
