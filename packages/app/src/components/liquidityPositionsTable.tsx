import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
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
  FrownIcon,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useState, useMemo } from 'react';
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
import { toast } from '~/hooks/use-toast';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { PeriodContextType } from '~/lib/context/PeriodProvider';
import { tickToPrice } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const LP_POSITIONS_QUERY = gql`
  query GetLPPositions(
    $owner: String
    $chainId: Int
    $marketAddress: String
    $epochId: Int
  ) {
    positions(
      owner: $owner
      chainId: $chainId
      marketAddress: $marketAddress
      epochId: $epochId
    ) {
      id
      positionId
      isLP
      baseToken
      quoteToken
      borrowedBaseToken
      borrowedQuoteToken
      collateral
      isSettled
      lpBaseToken
      lpQuoteToken
      lowPriceTick
      highPriceTick
      epoch {
        id
        epochId
        market {
          id
          chainId
          address
          resource {
            name
          }
        }
      }
    }
  }
`;

interface Props {
  walletAddress: string | null;
  periodContext: PeriodContextType;
}

const useLPPositions = (
  walletAddress: string | null,
  periodContext: PeriodContextType
) => {
  const { chainId, address: marketAddress, epoch } = periodContext;

  return useQuery({
    queryKey: ['lpPositions', walletAddress, chainId, marketAddress, epoch],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: LP_POSITIONS_QUERY,
          variables: {
            owner: walletAddress,
            chainId: walletAddress ? undefined : Number(chainId),
            marketAddress: walletAddress ? undefined : marketAddress,
            epochId: walletAddress ? undefined : Number(epoch),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const { data, errors } = await response.json();
      if (errors) {
        throw new Error(errors[0].message);
      }

      // Filter for LP positions only
      return data.positions.filter((position: any) => position.isLP);
    },
    enabled:
      Boolean(walletAddress) ||
      (Boolean(chainId) && Boolean(marketAddress) && Boolean(epoch)),
    refetchInterval: POLLING_INTERVAL,
  });
};

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

const LiquidityPositionsTable: React.FC<Props> = ({
  walletAddress,
  periodContext,
}) => {
  const { pool, endTime } = periodContext;
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'settled',
      desc: false,
    },
    {
      id: 'position',
      desc: true,
    },
  ]);

  const {
    data: positions,
    error,
    isLoading,
  } = useLPPositions(walletAddress, periodContext);

  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  const columns = useMemo(
    () =>
      createColumns(periodContext.chain, periodContext.address, pool, expired),
    [periodContext.chain, periodContext.address, pool, expired]
  );

  const table = useReactTable({
    data: positions || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  const renderSortIcon = (isSorted: string | false) => {
    if (isSorted === 'desc') {
      return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
    }
    if (isSorted === 'asc') {
      return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
    }
    return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
  };

  if (error) {
    toast({
      title: 'Error loading liquidity positions',
      description: error.message,
      duration: 5000,
    });
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
      </div>
    );
  }

  if (!positions?.length) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
        No relevant liquidity position data
      </div>
    );
  }

  return (
    <div className="w-full max-h-[66dvh] overflow-y-auto">
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
