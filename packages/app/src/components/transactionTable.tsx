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
import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import { useMemo, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { PeriodContextType } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';

import EpochTiming from './EpochTiming';
import NumberDisplay from './numberDisplay';

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
        collateral
        lpBaseDeltaToken
        lpQuoteDeltaToken
        baseTokenDelta
        quoteTokenDelta
        collateralDelta
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
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: TRANSACTIONS_QUERY,
          variables: {
            // If we have a walletAddress, use the chainId + marketAddress
            owner: walletAddress ? undefined : walletAddress,
            chainId: walletAddress ? Number(chainId) : undefined,
            marketAddress: walletAddress ? marketAddress : undefined,
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

  const { collateralAssetTicker, collateralAssetDecimals } = periodContext;

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
        id: 'collateral',
        header: 'Collateral',
        accessorKey: 'collateral',
      },
      {
        id: 'ggas',
        header: 'Virtual GGas Change',
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
          const baseToken = parseFloat(row.baseToken || '0');
          const quoteToken = parseFloat(row.quoteToken || '0');
          return baseToken !== 0 ? quoteToken / baseToken : 0;
        },
      },
      {
        id: 'time',
        header: 'Executed',
        accessorFn: (row) => row.timestamp,
      },
    ],
    []
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

  const renderCellContent = (cell: any, row: any) => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    if (columnId === 'market') {
      const marketName =
        row.original.position?.epoch?.market?.resource?.name ||
        'Unknown Market';
      const resourceSlug = row.original.position?.epoch?.market?.resource?.slug;
      const startTimestamp = row.original.position?.epoch?.startTimestamp;
      const endTimestamp = row.original.position?.epoch?.endTimestamp;
      const resource = resources?.find((r) => r.slug === resourceSlug);

      return (
        <div className="flex gap-4">
          {resource?.iconPath && (
            <Image
              src={resource.iconPath}
              alt={marketName}
              width={20}
              height={20}
            />
          )}
          <div className="flex flex-col gap-0.5">
            <div className="font-medium">{marketName}</div>
            {startTimestamp && endTimestamp && (
              <EpochTiming
                startTimestamp={startTimestamp}
                endTimestamp={endTimestamp}
              />
            )}
          </div>
        </div>
      );
    }

    if (columnId === 'position') {
      return (
        <div className="flex items-center gap-1">
          #{row.original.position.positionId}
          <Link
            href={`/positions/${row.original.position.epoch.market.chainId}:${row.original.position.epoch.market.address}/${row.original.position.positionId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5 text-blue-500 hover:text-blue-600" />
          </Link>
        </div>
      );
    }

    if (columnId === 'time') {
      const timestamp = value as number;
      const date = new Date(timestamp * 1000);
      return <span>{formatDistanceToNow(date, { addSuffix: true })}</span>;
    }

    if (columnId === 'collateral') {
      return (
        <div className="flex items-center gap-1">
          <NumberDisplay
            value={parseFloat(value) / 10 ** collateralAssetDecimals}
          />
          <span className="text-muted-foreground text-sm">
            {collateralAssetTicker}
          </span>
        </div>
      );
    }

    if (columnId === 'ggas') {
      if (['addLiquidity', 'removeLiquidity'].includes(row.original.type)) {
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay
              value={
                parseFloat(row.original.lpBaseDeltaToken || '0') / 10 ** 18
              }
            />
            <span className="text-muted-foreground text-sm">vGGas</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <NumberDisplay value={parseFloat(value || '0') / 10 ** 18} />
          <span className="text-muted-foreground text-sm">vGGas</span>
        </div>
      );
    }

    if (columnId === 'wsteth') {
      if (['addLiquidity', 'removeLiquidity'].includes(row.original.type)) {
        return (
          <div className="flex items-center gap-1">
            <NumberDisplay
              value={
                parseFloat(row.original.lpQuoteDeltaToken || '0') / 10 ** 18
              }
            />
            <span className="text-muted-foreground text-sm">vWstETH</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <NumberDisplay value={parseFloat(value || '0') / 10 ** 18} />
          <span className="text-muted-foreground text-sm">vWstETH</span>
        </div>
      );
    }

    if (['price'].includes(columnId)) {
      return <NumberDisplay value={value as number} />;
    }

    return flexRender(cell.column.columnDef.cell, cell.getContext());
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
