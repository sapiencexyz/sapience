'use client';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatEther } from 'viem';
import { formatDistanceToNow } from 'date-fns';

import type { Position as PositionType } from '@sapience/ui/types/graphql';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Badge } from '@sapience/ui/components/ui/badge';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useAllPositions } from '~/hooks/graphql/usePositions';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';
// removed classification check; show optionName whenever available
import {
  getSeriesColorByIndex,
  withAlpha,
  CHART_SERIES_COLORS,
} from '~/lib/theme/chartColors';
import { useMarketGroupPage } from '~/lib/context/MarketGroupPageProvider';

interface WagersTableProps {
  marketAddress?: string;
  chainId?: number;
  marketId?: number;
  marketIds?: number[];
  showHeaderText?: boolean;
}

function MaxPayoutCell({ position }: { position: PositionType }) {
  const baseTokenName = position.market?.marketGroup?.baseTokenName;
  const collateralSymbol = position.market?.marketGroup?.collateralSymbol;

  if (baseTokenName === 'Yes') {
    const baseTokenBI = BigInt(position.baseToken || '0');
    const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
    const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
    const value = Number(formatEther(netPositionBI));

    let maxPayoutAmountBI: bigint;
    if (value >= 0) {
      maxPayoutAmountBI = baseTokenBI;
    } else {
      maxPayoutAmountBI = borrowedBaseTokenBI;
    }
    const displayAmount = Number(formatEther(maxPayoutAmountBI));

    return (
      <>
        <NumberDisplay value={displayAmount} /> {collateralSymbol}
      </>
    );
  }
  return <span className="text-muted-foreground">N/A</span>;
}

const WagersTable: React.FC<WagersTableProps> = ({
  marketAddress,
  marketId,
  marketIds,
  showHeaderText = true,
}) => {
  const { data: positionsData, refetch } = useAllPositions({ marketAddress });
  const { marketGroupData } = useMarketGroupPage();

  useEffect(() => {
    refetch();
  }, [refetch]);

  const allPositions = useMemo(() => positionsData || [], [positionsData]);

  const filteredPositions = useMemo(() => {
    if (marketId != null) {
      return allPositions.filter((p) => p.market?.marketId === marketId);
    }
    if (marketIds && marketIds.length > 0) {
      const idSet = new Set(marketIds);
      return allPositions.filter((p) =>
        p.market?.marketId != null ? idSet.has(p.market.marketId) : false
      );
    }
    return allPositions;
  }, [allPositions, marketId, marketIds]);

  const traderPositions = useMemo(
    () => filteredPositions.filter((p) => !p.isLP),
    [filteredPositions]
  );

  // show option name if present on the position's market

  // Build a stable, globally consistent order for options based on marketId asc
  const sortedMarketsForColors = useMemo(() => {
    const list = marketGroupData?.markets || [];
    return list
      .slice()
      .sort(
        (a: any, b: any) => Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
      );
  }, [marketGroupData]);

  const columns = useMemo<ColumnDef<PositionType>[]>(
    () => [
      {
        id: 'position',
        accessorFn: (row) => {
          const pid = Number(
            (row as PositionType & { positionId?: number | string })
              .positionId || 0
          );
          return pid;
        },
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
            Position
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const position = row.original;
          const optionName = position.market?.optionName;
          const rawId = position.market?.marketId;
          const normalizeId = (id: any): { dec?: number; hex?: string } => {
            if (id == null) return {};
            const s = String(id);
            if (s.startsWith('0x') || s.startsWith('0X')) {
              try {
                const dec = parseInt(s, 16);
                return {
                  dec: Number.isFinite(dec) ? dec : undefined,
                  hex: s.toLowerCase(),
                };
              } catch {
                return { hex: s.toLowerCase() };
              }
            }
            const dec = Number(s);
            return { dec: Number.isFinite(dec) ? dec : undefined };
          };
          const { dec: positionMarketIdNum } = normalizeId(rawId);

          const findOptionIndex = (): number => {
            if (positionMarketIdNum != null) {
              const idx = sortedMarketsForColors.findIndex(
                (m: any) => Number(m?.marketId) === positionMarketIdNum
              );
              if (idx >= 0) return idx;
            }
            if (optionName) {
              const idx = sortedMarketsForColors.findIndex(
                (m: any) => (m?.optionName ?? '') === optionName
              );
              if (idx >= 0) return idx;
            }
            if (optionName) {
              const paletteSize = CHART_SERIES_COLORS.length || 5;
              let hash = 0;
              for (let i = 0; i < optionName.length; i++) {
                hash = (hash * 31 + optionName.charCodeAt(i)) | 0;
              }
              return ((hash % paletteSize) + paletteSize) % paletteSize;
            }
            return -1;
          };

          const optionIndex = findOptionIndex();
          let seriesColor =
            optionIndex >= 0 ? getSeriesColorByIndex(optionIndex) : undefined;
          if (!seriesColor) {
            const paletteSize = CHART_SERIES_COLORS.length || 5;
            const idNum = Number(positionMarketIdNum ?? 0);
            const fallbackIndex =
              ((idNum % paletteSize) + paletteSize) % paletteSize;
            seriesColor = getSeriesColorByIndex(fallbackIndex);
          }
          const createdAtStr = (
            position as PositionType & { createdAt?: string }
          ).createdAt;
          const createdMs = createdAtStr ? new Date(createdAtStr).getTime() : 0;
          const createdDisplay =
            Number.isFinite(createdMs) && createdMs > 0
              ? formatDistanceToNow(new Date(createdMs), { addSuffix: true })
              : '';
          return (
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  Position #
                  {
                    (
                      position as PositionType & {
                        positionId?: number | string;
                      }
                    ).positionId
                  }
                </span>
                {optionName
                  ? (() => {
                      const lower = String(optionName).toLowerCase();
                      const yesNoClass =
                        lower === 'yes'
                          ? 'border-green-500/40 bg-green-500/10 text-green-600'
                          : lower === 'no'
                            ? 'border-red-500/40 bg-red-500/10 text-red-600'
                            : '';
                      const useSeriesStyle = yesNoClass === '';
                      return (
                        <Badge
                          variant="outline"
                          className={`truncate max-w-[220px] ${yesNoClass}`}
                          style={
                            useSeriesStyle
                              ? {
                                  backgroundColor: seriesColor
                                    ? withAlpha(seriesColor, 0.08)
                                    : undefined,
                                  borderColor: seriesColor
                                    ? withAlpha(seriesColor, 0.24)
                                    : undefined,
                                  color: seriesColor || undefined,
                                }
                              : undefined
                          }
                          title={optionName}
                        >
                          {optionName}
                        </Badge>
                      );
                    })()
                  : null}
              </div>
              {createdDisplay ? (
                <div className="text-sm text-muted-foreground mt-0.5">
                  created {createdDisplay}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'wager',
        accessorFn: (row) => Number(formatEther(BigInt(row.collateral || '0'))),
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
            Wager
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const position = row.original;
          const isClosed = Number(position.collateral) === 0;
          const collateralAmount = Number(
            formatEther(BigInt(position.collateral || '0'))
          );
          const collateralSymbol =
            position.market?.marketGroup?.collateralSymbol || 'Unknown';
          // option name moved to Position column

          // Determine Yes/No for YES_NO markets based on net position
          const baseTokenAmount = Number(
            formatEther(BigInt(position.baseToken || '0'))
          );
          const borrowedBaseTokenAmount = Number(
            formatEther(BigInt(position.borrowedBaseToken || '0'))
          );
          const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
          const isLong = netPosition >= 0;
          const marketGroup = position.market?.marketGroup as any;
          const classification = marketGroup
            ? getMarketGroupClassification(marketGroup)
            : MarketGroupClassification.NUMERIC;
          const isYesNo = classification === MarketGroupClassification.YES_NO;
          return (
            <div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="whitespace-nowrap">
                  <NumberDisplay value={collateralAmount} /> {collateralSymbol}
                </span>
                {isYesNo ? (
                  <>
                    <span>on</span>
                    <Badge
                      variant="outline"
                      className={
                        isLong
                          ? 'border-green-500/40 bg-green-500/10 text-green-600'
                          : 'border-red-500/40 bg-red-500/10 text-red-600'
                      }
                    >
                      {isLong ? 'Yes' : 'No'}
                    </Badge>
                  </>
                ) : null}
              </div>
              {!isClosed && (
                <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
                  To Win: <MaxPayoutCell position={position} />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'owner',
        accessorFn: (row) => (row.owner ? String(row.owner).toLowerCase() : ''),
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
            Owner
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const position = row.original;
          return (
            <div>
              <div className="flex items-center gap-2">
                {position.owner ? (
                  <EnsAvatar
                    address={position.owner}
                    className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                    width={20}
                    height={20}
                  />
                ) : null}
                <div className="[&_span.font-mono]:text-foreground">
                  <AddressDisplay address={position.owner || ''} />
                </div>
              </div>
            </div>
          );
        },
      },
    ],
    [sortedMarketsForColors]
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'position', desc: true },
  ]);

  const table = useReactTable({
    data: traderPositions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (traderPositions.length === 0) {
    return (
      <div className="space-y-6">
        {showHeaderText && <h3 className="text-2xl font-medium">Wagers</h3>}
        <div className="rounded border bg-card p-6 text-center text-muted-foreground">
          No wagers yet...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showHeaderText && <h3 className="text-2xl font-medium">Wagers</h3>}
      <div className="rounded border bg-card overflow-hidden">
        <Table className="table-auto">
          <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className={'whitespace-normal'}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="xl:table-row block border-b last:border-b-0 space-y-3 xl:space-y-0 px-4 py-4 xl:px-0 xl:py-0"
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id;
                  const mobileLabel =
                    colId === 'wager'
                      ? 'Wager'
                      : colId === 'owner'
                        ? 'Owner'
                        : undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={
                        'block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3'
                      }
                    >
                      {mobileLabel ? (
                        <div className="text-xs text-muted-foreground xl:hidden mb-1.5">
                          {mobileLabel}
                        </div>
                      ) : null}
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default WagersTable;
