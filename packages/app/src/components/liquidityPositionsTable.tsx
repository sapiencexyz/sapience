import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FrownIcon,
  Loader2,
  ExternalLinkIcon,
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
import { useResources } from '~/lib/hooks/useResources';
import { tickToPrice } from '~/lib/util/util';

import MarketCell from './MarketCell';
import NumberDisplay from './numberDisplay';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const LP_POSITIONS_QUERY = `
  query GetLPPositions(
    $owner: String
    $chainId: Int
    $marketAddress: String
  ) {
    positions(
      owner: $owner
      chainId: $chainId
      marketAddress: $marketAddress
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
        startTimestamp
        endTimestamp
        market {
          id
          chainId
          address
          resource {
            name
            slug
          }
        }
      }
      transactions {
        id
        type
        timestamp
        transactionHash
        baseToken
        quoteToken
        collateral
        lpBaseDeltaToken
        lpQuoteDeltaToken
        tradeRatioD18
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
  const { chainId, address: marketAddress } = periodContext;

  return useQuery({
    queryKey: ['lpPositions', walletAddress, chainId, marketAddress],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: LP_POSITIONS_QUERY,
          variables: {
            owner: walletAddress || undefined,
            chainId: walletAddress ? undefined : Number(chainId),
            marketAddress: walletAddress ? undefined : marketAddress,
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
      Boolean(walletAddress) || (Boolean(chainId) && Boolean(marketAddress)),
    refetchInterval: POLLING_INTERVAL,
  });
};

const usePositionPnL = (
  positionId: number,
  chainId: number,
  address: string
) => {
  return useReadContract({
    chainId,
    address: address as `0x${string}`,
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
    args: [BigInt(positionId)],
  });
};

const PnLCell = ({
  positionId,
  chainId,
  address,
  collateralAssetDecimals,
  collateralAssetTicker,
}: {
  positionId: number;
  chainId: number;
  address: string;
  collateralAssetDecimals: number;
  collateralAssetTicker: string;
}) => {
  const res = usePositionPnL(positionId, chainId, address);

  if (res.isLoading) return null;

  return (
    <div className="flex items-center gap-1">
      <NumberDisplay
        value={
          parseFloat(res.data?.toString() || '0') /
          10 ** collateralAssetDecimals
        }
      />
      <span className="text-muted-foreground text-sm">
        {collateralAssetTicker}
      </span>
    </div>
  );
};

const PnLHeaderCell = () => (
  <span className="flex items-center gap-1">
    Profit/Loss{' '}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-normal">
            This is an estimate that does not take into account slippage or
            fees.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </span>
);

const LiquidityPositionsTable: React.FC<Props> = ({
  walletAddress,
  periodContext,
}) => {
  const { endTime } = periodContext;
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
  const { data: resources } = useResources();

  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  const renderCellContent = (cell: any, row: any) => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    switch (columnId) {
      case 'market':
        return (
          <MarketCell
            marketName={
              row.original.epoch?.market?.resource?.name || 'Unknown Market'
            }
            resourceSlug={row.original.epoch?.market?.resource?.slug}
            startTimestamp={row.original.epoch?.startTimestamp}
            endTimestamp={row.original.epoch?.endTimestamp}
            resources={resources}
          />
        );
      case 'position': {
        const positionUrl = `/positions/${row.original.epoch?.market?.chainId}:${row.original.epoch?.market?.address}/${row.original.positionId}`;
        return (
          <div className="flex items-center gap-1">
            #{row.original.positionId.toString()}
            <Link href={positionUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="h-3.5 w-3.5 text-blue-500 hover:text-blue-600" />
            </Link>
          </div>
        );
      }
      case 'collateral':
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay
              value={
                parseFloat(value) / 10 ** periodContext.collateralAssetDecimals
              }
            />
            <span className="text-muted-foreground text-sm">
              {periodContext.collateralAssetTicker}
            </span>
          </div>
        );
      case 'baseToken':
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay value={parseFloat(value) / 10 ** 18} />
            <span className="text-muted-foreground text-sm">vGGas</span>
          </div>
        );
      case 'quoteToken':
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay value={parseFloat(value) / 10 ** 18} />
            <span className="text-muted-foreground text-sm">vWstETH</span>
          </div>
        );
      case 'lowPrice':
      case 'highPrice':
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay value={tickToPrice(Number(value))} />
            <span className="text-muted-foreground text-sm">
              {periodContext.useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
            </span>
          </div>
        );
      case 'pnl':
        return (
          <PnLCell
            positionId={row.original.positionId}
            chainId={periodContext.chainId}
            address={periodContext.address}
            collateralAssetDecimals={periodContext.collateralAssetDecimals}
            collateralAssetTicker={periodContext.collateralAssetTicker}
          />
        );
      case 'settled':
        return value ? <Check className="h-4 w-4 text-green-500 mr-2" /> : null;
      default:
        return value;
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row) =>
          row.epoch?.market?.resource?.name || 'Unknown Market',
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.positionId,
      },
      {
        id: 'collateral',
        header: 'Collateral',
        accessorKey: 'collateral',
      },
      {
        id: 'baseToken',
        header: 'Virtual Ggas',
        accessorKey: 'lpBaseToken',
      },
      {
        id: 'quoteToken',
        header: 'Virtual wstETH',
        accessorKey: 'lpQuoteToken',
      },
      {
        id: 'lowPrice',
        header: 'Low Price',
        accessorKey: 'lowPriceTick',
      },
      {
        id: 'highPrice',
        header: 'High Price',
        accessorKey: 'highPriceTick',
      },
      {
        id: 'pnl',
        header: PnLHeaderCell,
        accessorFn: (row) => row.positionId,
      },
      ...(expired
        ? [
            {
              id: 'settled',
              header: 'Settled',
              accessorKey: 'isSettled',
            },
          ]
        : []),
    ],
    [periodContext, expired, resources]
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
    <div className="w-full max-h-[66dvh] overflow-y-auto whitespace-nowrap">
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
                  {renderCellContent(cell, row)}
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
