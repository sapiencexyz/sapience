import { Badge } from '@foil/ui/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { foilAbi } from '@foil/ui/lib/abi';
import type { PositionType } from '@foil/ui/types';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { MarketGroupCategory } from '~/hooks/graphql/useMarketGroup';
import { formatNumber } from '~/lib/utils/util';

import SettlePositionButton from './SettlePositionButton';

interface UserPositionsTableProps {
  marketAddress: string;
  chainId: number;
  userPositions: PositionType[];
  marketCategory: MarketGroupCategory;
  refetchUserPositions?: () => void;
}

// LP Value display component
const LPValueDisplay: React.FC<{ position: PositionType }> = () => {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-sm">TBD</span>
    </div>
  );
};

// Trade Value display component
const TradeValueDisplay: React.FC<{
  position: PositionType;
  marketCategory: MarketGroupCategory;
}> = ({ position, marketCategory }) => {
  // For Yes/No markets, show Yes/No based on borrowed tokens
  if (marketCategory === MarketGroupCategory.YES_NO) {
    const hasBorrowedBase = BigInt(position.borrowedBaseToken || 0) > 0;
    const hasBorrowedQuote = BigInt(position.borrowedQuoteToken || 0) > 0;

    return (
      <div className="flex flex-col">
        {/* eslint-disable-next-line no-nested-ternary */}
        {hasBorrowedBase ? (
          <span className="font-medium">No</span>
        ) : hasBorrowedQuote ? (
          <span className="font-medium">Yes</span>
        ) : (
          <span className="text-muted-foreground text-sm">Unknown</span>
        )}
      </div>
    );
  }

  // For other market types, could expand with other display formats
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-sm">TBD</span>
    </div>
  );
};

// Position Value display selector - chooses the right component based on position type
const PositionValueDisplay: React.FC<{
  position: PositionType;
  marketCategory: MarketGroupCategory;
}> = ({ position, marketCategory }) => {
  if (position.isLP) {
    return <LPValueDisplay position={position} />;
  }
  return (
    <TradeValueDisplay position={position} marketCategory={marketCategory} />
  );
};

// PnL display component with loading state
const PnLDisplay = ({
  positionId,
  marketAddress,
  chainId,
  collateral,
}: {
  positionId: string;
  marketAddress: string;
  chainId: number;
  collateral: string;
}) => {
  // Read PnL from contract
  const { data: pnlData, isLoading } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilAbi().abi,
    functionName: 'getPositionPnl',
    args: [BigInt(positionId)],
    chainId,
  });

  // Format collateral
  const formattedCollateral = formatNumber(Number(collateral) / 10 ** 18, 4);

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="h-5 w-20 bg-secondary/20 animate-pulse rounded" />
        <span className="text-xs text-muted-foreground mt-1">
          {formattedCollateral} collateral
        </span>
      </div>
    );
  }

  if (pnlData === undefined) {
    return (
      <div className="flex flex-col">
        <span className="font-medium">Error fetching PnL</span>
        <span className="text-xs text-muted-foreground">
          {formattedCollateral} collateral
        </span>
      </div>
    );
  }

  // Convert from Wei to Ether and format
  const pnlValue = Number(formatUnits(pnlData as bigint, 18));
  const isPositive = pnlValue > 0;
  const formattedPnL = formatNumber(Math.abs(pnlValue), 4);

  return (
    <div className="flex flex-col">
      <span
        className={`font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
      >
        {isPositive ? '+' : '-'}
        {formattedPnL}
      </span>
      <span className="text-xs text-muted-foreground">
        {formattedCollateral} collateral
      </span>
    </div>
  );
};

const UserPositionsTable: React.FC<UserPositionsTableProps> = ({
  userPositions,
  marketAddress,
  chainId,
  marketCategory,
  refetchUserPositions,
}) => {
  const renderPositionIdCell = (positionId: string) => {
    return (
      <span className="font-mono text-xs bg-secondary/20 px-2 py-0.5 rounded">
        #{positionId}
      </span>
    );
  };

  const renderTypeCell = (isLP: boolean) => {
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs ${isLP ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}`}
      >
        {isLP ? 'Liquidity' : 'Trade'}
      </span>
    );
  };

  const renderPnLCell = (position: PositionType) => {
    return (
      <PnLDisplay
        positionId={position.positionId.toString()}
        marketAddress={marketAddress}
        chainId={chainId}
        collateral={position.collateral}
      />
    );
  };

  const renderValueCell = (position: PositionType) => {
    return (
      <PositionValueDisplay
        position={position}
        marketCategory={marketCategory}
      />
    );
  };

  const renderExpirationCell = (position: PositionType) => {
    const endTimestamp = position.market?.endTimestamp;

    if (!endTimestamp) {
      return <span className="text-muted-foreground text-sm">Unknown</span>;
    }

    const endTime = Number(endTimestamp) * 1000; // Convert to milliseconds
    const now = Date.now();

    // Check if expired
    if (now > endTime) {
      // If position is already settled, show a settled badge
      if (position.isSettled) {
        return (
          <div className="flex items-center gap-2 justify-end w-full">
            <Badge
              variant="outline"
              className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
            >
              <Check className="h-3 w-3 mr-1" />
              Settled
            </Badge>
            <Link
              href={`/positions/${chainId}:${marketAddress}/${position.positionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        );
      }

      // If expired but not settled, show the settle button
      return (
        <div className="flex items-center gap-2 justify-end w-full">
          <SettlePositionButton
            positionId={position.positionId.toString()}
            marketAddress={marketAddress}
            chainId={chainId}
            onSuccess={refetchUserPositions}
          />
          <Link
            href={`/positions/${chainId}:${marketAddress}/${position.positionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      );
    }

    // Show time remaining
    try {
      const timeLeft = formatDistanceToNow(new Date(endTime), {
        addSuffix: false,
      });
      return (
        <div className="flex items-center gap-2 justify-end w-full">
          <span className="text-sm">{timeLeft} left</span>
          <Link
            href={`/positions/${chainId}:${marketAddress}/${position.positionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      );
    } catch (error) {
      return (
        <span className="text-muted-foreground text-sm">Invalid date</span>
      );
    }
  };

  // Define columns
  const columns: ColumnDef<PositionType>[] = React.useMemo(() => {
    // Check if any positions are expired to determine column header
    const hasExpiredPositions = userPositions.some((position) => {
      if (!position.market?.endTimestamp) return false;
      const endTime = Number(position.market.endTimestamp) * 1000;
      return Date.now() > endTime;
    });

    return [
      {
        accessorKey: 'positionId',
        header: 'Position',
        cell: ({ getValue }) => renderPositionIdCell(getValue() as string),
      },
      {
        accessorKey: 'isLP',
        header: 'Type',
        cell: ({ getValue }) => renderTypeCell(getValue() as boolean),
      },
      {
        id: 'value',
        header: 'Position Value',
        cell: ({ row }) => renderValueCell(row.original),
      },
      {
        id: 'pnl',
        header: 'PnL',
        cell: ({ row }) => renderPnLCell(row.original),
      },
      {
        id: 'expiration',
        header: hasExpiredPositions ? '' : 'Expires In',
        cell: ({ row }) => renderExpirationCell(row.original),
      },
    ];
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [userPositions]);

  // Initialize the table
  const table = useReactTable({
    data: userPositions || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // No positions
  if (!userPositions || userPositions.length === 0) {
    return (
      <div className="mt-6 text-center p-6 border border-muted rounded-md bg-background/50">
        <p className="text-muted-foreground">
          You don&apos;t have any positions in this market yet.
        </p>
      </div>
    );
  }

  // Render the table
  return (
    <div className="border border-muted rounded-md bg-background/50 overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={
                    header.id === 'expiration' ? 'text-right' : undefined
                  }
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
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === 'expiration' ? 'text-right' : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No positions found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserPositionsTable;
