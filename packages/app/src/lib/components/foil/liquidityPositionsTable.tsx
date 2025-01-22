import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import {
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useContext, useState, useMemo } from 'react';
import { useReadContract } from 'wagmi';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarketContext } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

interface Props {
  positions: any[];
}

// Define cell components outside the main component
const PositionCell = ({
  row,
  chain,
  address,
}: {
  row: any;
  chain: any;
  address: string;
}) => (
  <Link
    href={`/positions/${chain?.id}:${address}/${row.original.positionId}`}
    className="text-primary underline"
  >
    #{row.original.positionId.toString()}
  </Link>
);

const CollateralCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> wstETH
  </>
);

const BaseTokenCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> Ggas
  </>
);

const PriceCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> Ggas/wstETH
  </>
);

const PnLCell = ({ cell }: { cell: any }) => {
  const { chainId, address } = cell.getValue();
  const positionID = cell.row.original.positionId;

  const res = useReadContract({
    chainId,
    address,
    abi: [
      {
        type: 'function',
        name: 'getPositionPnl',
        inputs: [{ type: 'uint256' }],
        outputs: [{ type: 'int256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'getPositionPnl',
    args: [positionID],
  });

  return res.isLoading || chainId === undefined ? null : (
    <NumberDisplay value={res.data || 0} />
  );
};

const PnLHeaderCell = () => (
  <span className="flex items-center">
    Profit/Loss{' '}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <HelpCircle className="ml-1 h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>
            This is an estimate that does not take into account slippage or
            fees.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </span>
);

const SettledCell = ({ cell }: { cell: any }) =>
  cell.getValue() ? <Check className="text-green-500 mr-2 h-4 w-4" /> : null;

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

// Move the column definition outside the component
const createColumns = (
  chain: any,
  address: string,
  pool: any,
  expired: boolean
) => [
  {
    id: 'market',
    header: 'Market',
    accessorFn: (row: any) =>
      `${row.epoch.market.resource.name} (Epoch ${row.epoch.epochId})`,
  },
  {
    id: 'position',
    header: 'Position',
    accessorFn: (row: any) => row.positionId,
    cell: (props: any) => (
      <PositionCell row={props.row} chain={chain} address={address} />
    ),
  },
  {
    id: 'collateral',
    header: 'Collateral',
    accessorKey: 'collateral',
    cell: CollateralCell,
  },
  {
    id: 'baseToken',
    header: 'Base Token',
    accessorKey: 'lpBaseToken',
    cell: BaseTokenCell,
  },
  {
    id: 'quoteToken',
    header: 'Quote Token',
    accessorKey: 'lpQuoteToken',
    cell: CollateralCell,
  },
  {
    id: 'lowPrice',
    header: 'Low Price',
    accessorFn: (row: any) => tickToPrice(row.lowPriceTick),
    cell: PriceCell,
  },
  {
    id: 'highPrice',
    header: 'High Price',
    accessorFn: (row: any) => tickToPrice(row.highPriceTick),
    cell: PriceCell,
  },
  {
    id: 'pnl',
    header: PnLHeaderCell,
    accessorFn: (row: any) => ({ row, pool, address, chainId: chain.id }),
    cell: PnLCell,
  },
  ...(expired
    ? [
        {
          id: 'settled',
          header: 'Settled',
          accessorKey: 'isSettled',
          cell: SettledCell,
        },
      ]
    : []),
];

const LiquidityPositionsTable: React.FC<Props> = ({ positions }) => {
  const { pool, endTime, chain, address } = useContext(MarketContext);
  const [sorting, setSorting] = useState<SortingState>([]);
  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  // Use the createColumns function instead of defining columns directly
  const columns = useMemo(
    () => createColumns(chain, address, pool, expired),
    [chain, address, pool, expired]
  );

  const table = useReactTable({
    data: positions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <div className="w-full">
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

export default LiquidityPositionsTable;
