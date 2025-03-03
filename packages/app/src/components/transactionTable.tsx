import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FrownIcon,
  Loader2,
  ExternalLinkIcon,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useMemo, useState } from 'react';

import { useFoil } from '../lib/context/FoilProvider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PeriodContextType } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
import { convertWstEthToGwei, foilApi } from '~/lib/utils/util';

import MarketCell from './MarketCell';
import NumberDisplay from './numberDisplay';
import PositionDisplay from './PositionDisplay';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const TRANSACTIONS_QUERY = `
  query GetTransactions(
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
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        market {
          id
          address
          chainId
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
        lpBaseDeltaToken
        lpQuoteDeltaToken
        baseTokenDelta
        quoteTokenDelta
        collateralDelta
        tradeRatioD18
      }
    }
  }
`;

interface Props {
  walletAddress: string | null;
  periodContext: PeriodContextType;
}

const getTypeDisplay = (type: string) => {
  switch (type) {
    case 'long':
      return 'Long Trade';
    case 'short':
      return 'Short Trade';
    case 'addLiquidity':
      return 'Liquidity Added';
    case 'removeLiquidity':
      return 'Liquidity Removed';
    default:
      return type;
  }
};

function useTransactions(
  walletAddress: string | null,
  periodContext: PeriodContextType
) {
  const { chainId, address: marketAddress } = periodContext;

  return useQuery({
    queryKey: ['transactions', walletAddress, chainId, marketAddress],
    queryFn: async () => {
      const { data, errors } = await foilApi.post('/graphql', {
        query: TRANSACTIONS_QUERY,
        variables: {
          // If we have a walletAddress, query all positions for that owner
          // If no walletAddress, query the specific market/chain for all owners
          owner: walletAddress || undefined,
          chainId: walletAddress ? undefined : Number(chainId),
          marketAddress: walletAddress ? undefined : marketAddress,
        },
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      // Flatten all transactions from all positions
      return data.positions.flatMap((position: any) =>
        position.transactions.map((tx: any) => ({
          ...tx,
          position,
        }))
      );
    },
    // Only enable if we have a walletAddress or if we have chainId & marketAddress
    enabled:
      Boolean(walletAddress) || (Boolean(chainId) && Boolean(marketAddress)),
    refetchInterval: POLLING_INTERVAL,
  });
}

const TransactionTable: React.FC<Props> = ({
  walletAddress,
  periodContext,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'time', desc: true },
  ]);

  const { data: resources } = useResources();
  const {
    data: transactions,
    error,
    isLoading,
  } = useTransactions(walletAddress, periodContext);

  const { collateralAssetTicker, collateralAssetDecimals, useMarketUnits } =
    periodContext;

  const { stEthPerToken } = useFoil();

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row) =>
          row.position?.epoch?.market?.resource?.name || 'Unknown Market',
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.position.positionId,
      },
      {
        id: 'type',
        header: 'Activity',
        accessorFn: (row) => getTypeDisplay(row.type),
      },
      {
        id: 'collateralDelta',
        header: 'Collateral Change',
        accessorKey: 'collateralDelta',
      },
      {
        id: 'ggas',
        header: 'Virtual Ggas Change',
        accessorFn: (row) => {
          if (['addLiquidity', 'removeLiquidity'].includes(row.type)) {
            return row.lpBaseDeltaToken;
          }
          return row.baseTokenDelta;
        },
      },
      {
        id: 'wsteth',
        header: 'Virtual wstETH Change',
        accessorFn: (row) => {
          if (['addLiquidity', 'removeLiquidity'].includes(row.type)) {
            return row.lpQuoteDeltaToken;
          }
          return row.quoteToken;
        },
      },
      {
        id: 'price',
        header: 'Price',
        accessorFn: (row) => {
          const tradeRatio = row.tradeRatioD18
            ? parseFloat(row.tradeRatioD18) / 10 ** 18
            : 0;
          return useMarketUnits
            ? tradeRatio
            : convertWstEthToGwei(tradeRatio, stEthPerToken);
        },
      },
      {
        id: 'time',
        header: 'Executed',
        accessorFn: (row) => row.timestamp,
      },
    ],
    [useMarketUnits, stEthPerToken]
  );

  const table = useReactTable({
    data: transactions || [],
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

  const renderPositionCell = (row: any) => (
    <div className="flex items-center gap-1">
      <PositionDisplay
        positionId={row.original.position.positionId}
        marketType={row.original.position.epoch.market.isYin ? 'yin' : 'yang'}
      />
      <Link
        href={`/positions/${row.original.position.epoch.market.chainId}:${row.original.position.epoch.market.address}/${row.original.position.positionId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLinkIcon className="h-3.5 w-3.5 text-blue-500 hover:text-blue-600" />
      </Link>
    </div>
  );

  const renderTimeCell = (value: any) => {
    const timestamp = value as number;
    const date = new Date(timestamp * 1000);
    return <span>{formatDistanceToNow(date, { addSuffix: true })}</span>;
  };

  const renderCollateralCell = (value: any) => (
    <div className="flex items-center gap-1">
      <NumberDisplay
        value={parseFloat(value) / 10 ** collateralAssetDecimals}
      />
      <span className="text-muted-foreground text-sm">
        {collateralAssetTicker}
      </span>
    </div>
  );

  const renderLiquidityTokenCell = (row: any, tokenType: 'base' | 'quote') => {
    const value =
      tokenType === 'base'
        ? row.original.lpBaseDeltaToken
        : row.original.lpQuoteDeltaToken;
    const label = tokenType === 'base' ? 'vGgas' : 'vWstETH';

    return (
      <div className="flex items-center gap-1">
        <NumberDisplay value={parseFloat(value || '0') / 10 ** 18} />
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
    );
  };

  const renderTokenCell = (value: any, label: string) => (
    <div className="flex items-center gap-1">
      <NumberDisplay value={parseFloat(value || '0') / 10 ** 18} />
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  );

  const renderPriceCell = (value: any, row: any) => {
    if (['addLiquidity', 'removeLiquidity'].includes(row.original.type)) {
      return <span className="text-muted-foreground text-sm">N/A</span>;
    }
    return (
      <div className="flex items-center gap-1">
        <NumberDisplay value={value} />
        <span className="text-muted-foreground text-sm">
          {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
        </span>
      </div>
    );
  };

  const renderCellContent = (cell: any, row: any) => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    switch (columnId) {
      case 'market':
        return (
          <MarketCell
            marketName={
              row.original.position?.epoch?.market?.resource?.name ||
              'Unknown Market'
            }
            resourceSlug={row.original.position?.epoch?.market?.resource?.slug}
            startTimestamp={row.original.position?.epoch?.startTimestamp}
            endTimestamp={row.original.position?.epoch?.endTimestamp}
            resources={resources}
          />
        );
      case 'position':
        return renderPositionCell(row);
      case 'time':
        return renderTimeCell(value);
      case 'collateralDelta':
        return renderCollateralCell(value);
      case 'ggas':
        if (['addLiquidity', 'removeLiquidity'].includes(row.original.type)) {
          return renderLiquidityTokenCell(row, 'base');
        }
        return renderTokenCell(value, 'vGgas');
      case 'wsteth':
        if (['addLiquidity', 'removeLiquidity'].includes(row.original.type)) {
          return renderLiquidityTokenCell(row, 'quote');
        }
        return renderTokenCell(value, 'vWstETH');
      case 'price':
        return renderPriceCell(value, row);
      case 'type':
        return getTypeDisplay(value);
      default:
        return value;
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FrownIcon className="h-8 w-8 mb-2 opacity-20" />
        <div>Error loading transactions: {error.message}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
        No relevant transaction data
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
              <TableHead />
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
              <TableCell>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${periodContext.chain?.blockExplorers?.default.url}/tx/${row.original.transactionHash}`}
                >
                  <img
                    src="/etherscan.svg"
                    alt="View on Etherscan"
                    width={20}
                    height={20}
                    className="opacity-80"
                  />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionTable;
