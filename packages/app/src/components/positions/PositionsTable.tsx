'use client';

import type { Address } from 'viem';
import { formatEther } from 'viem';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import * as React from 'react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import Loader from '~/components/shared/Loader';
import CountdownCell from '~/components/shared/CountdownCell';
import PicksSummary from '~/components/shared/PicksSummary';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  usePositionBalances,
  type PositionBalance,
  type PickData,
} from '~/hooks/graphql/usePositions';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import type { ConditionById } from '@sapience/sdk/queries';
import type { Pick } from '~/components/shared/StackedPredictions';
import type { PythPrediction } from '@sapience/ui';
import {
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '~/lib/auction/decodePredictedOutcomes';
import {
  PositionsTableFilters,
  getDefaultPositionsFilterState,
  type PositionsFilterState,
} from '~/components/positions/PositionsTableFilters';
import EscrowPositionDialog, {
  type EscrowPositionRow,
} from '~/components/positions/EscrowPositionDialog';
import ShareDialog from '~/components/shared/ShareDialog';
import { formatDistanceToNow } from 'date-fns';

// --- Pyth descriptor parser (same logic as LegacyPositionsTable) ---

function parsePythDescriptor(
  desc: string | null | undefined
): { strikePrice: bigint; strikeExpo: number; priceId?: string } | null {
  const s = (desc ?? '').trim();
  if (!s.startsWith('PYTH_LAZER|')) return null;
  const firstLine = s.split('\n')[0] ?? s;
  const parts = firstLine.split('|');
  const kv = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    kv.set(part.slice(0, i), part.slice(i + 1));
  }
  const priceId = kv.get('priceId') || undefined;
  const strikePriceStr = kv.get('strikePrice');
  const strikeExpoStr = kv.get('strikeExpo');
  if (!strikePriceStr || !strikeExpoStr) return null;
  try {
    const strikePrice = BigInt(strikePriceStr);
    const strikeExpo = Number(strikeExpoStr);
    if (!Number.isFinite(strikeExpo)) return null;
    return { strikePrice, strikeExpo, priceId };
  } catch {
    return null;
  }
}

// --- Row type ---

interface UIPositionBalance {
  id: number;
  pickConfigId: string;
  isPredictorToken: boolean;
  balance: bigint;
  totalPool: bigint;
  status: 'active' | 'won' | 'lost';
  endsAt: number | null;
  legs: Pick[];
  hasPythLeg: boolean;
  uniqueKey: string;
}

// --- Helpers ---

function deriveStatus(
  pickConfig: PositionBalance['pickConfig'],
  isPredictorToken: boolean
): 'active' | 'won' | 'lost' {
  if (!pickConfig?.resolved) return 'active';
  const result = pickConfig.result;
  if (result === 'PREDICTOR_WINS') return isPredictorToken ? 'won' : 'lost';
  if (result === 'COUNTERPARTY_WINS') return isPredictorToken ? 'lost' : 'won';
  // NON_DECISIVE or unknown → lost
  return 'lost';
}

function buildLeg(
  pick: PickData,
  condition: ConditionById | undefined,
  isPredictorToken: boolean
): Pick {
  const question = condition?.question || pick.conditionId;
  const desc = condition?.description ?? null;
  const pythMeta = parsePythDescriptor(desc);

  // predictedOutcome is stored from the predictor's perspective (OutcomeSide: YES=0, NO=1)
  const predictorBetYes = pick.predictedOutcome === 0;

  // For display: predictor token shows predictor's choice, counterparty token shows the opposite
  const displayBetYes = isPredictorToken ? predictorBetYes : !predictorBetYes;

  if (pythMeta) {
    const strikeStr = formatPythPriceDecimalFromInt(
      pythMeta.strikePrice,
      pythMeta.strikeExpo
    );
    const priceNum = Number(strikeStr);
    const endTimeSec =
      typeof condition?.endTime === 'number' ? condition.endTime : null;
    const dateTimeLocal =
      endTimeSec !== null
        ? formatUnixSecondsToLocalInput(BigInt(endTimeSec))
        : '';
    const feedLabel = String(condition?.question || question || '');

    const pythPrediction: PythPrediction = {
      id: `${pick.conditionId ?? 'pyth'}:${strikeStr}:${pythMeta.strikeExpo}:${endTimeSec ?? 'no-end'}`,
      priceId: pythMeta.priceId || pick.conditionId || feedLabel || 'pyth',
      priceFeedLabel: feedLabel || undefined,
      direction: displayBetYes ? 'over' : 'under',
      targetPrice: Number.isFinite(priceNum) ? priceNum : 0,
      targetPriceRaw: strikeStr,
      targetPriceFullPrecision: strikeStr,
      priceExpo: pythMeta.strikeExpo,
      dateTimeLocal: dateTimeLocal || '—',
    };

    return {
      question,
      choice: displayBetYes ? 'OVER' : 'UNDER',
      conditionId: pick.conditionId,
      resolverAddress: condition?.resolver ?? null,
      categorySlug: null,
      endTime: condition?.endTime ?? null,
      description: desc,
      source: 'pyth',
      pythPrediction,
      settled: condition?.settled ?? undefined,
      resolvedToYes: condition?.resolvedToYes ?? undefined,
    };
  }

  return {
    question,
    choice: displayBetYes ? 'YES' : 'NO',
    conditionId: pick.conditionId,
    resolverAddress: condition?.resolver ?? null,
    categorySlug: condition?.category?.slug ?? null,
    endTime: condition?.endTime ?? null,
    description: desc,
    source: 'uma',
    settled: condition?.settled ?? undefined,
    resolvedToYes: condition?.resolvedToYes ?? undefined,
  };
}

// --- Sortable column header ---

function SortableHeader({
  column,
  label,
}: {
  column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' };
  label: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
    >
      {label}
      {sorted === 'asc' ? (
        <ChevronUp className="h-4 w-4" />
      ) : sorted === 'desc' ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <span className="flex flex-col -my-2">
          <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
          <ChevronDown className="h-3 w-3 opacity-50" />
        </span>
      )}
    </Button>
  );
}

// --- Main component ---

export default function PositionsTable({
  account,
  showHeaderText: _showHeaderText = true,
  chainId,
  leftSlot,
}: {
  account: Address;
  showHeaderText?: boolean;
  chainId?: number;
  leftSlot?: React.ReactNode;
}) {
  const collateralSymbol =
    COLLATERAL_SYMBOLS[chainId || DEFAULT_CHAIN_ID] || 'USDe';

  // Filter state
  const [filters, setFilters] = React.useState<PositionsFilterState>(
    getDefaultPositionsFilterState
  );

  // Sorting state
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // Dialog state
  const [openDialogId, setOpenDialogId] = React.useState<string | null>(null);

  // Share dialog state
  const [openShareId, setOpenShareId] = React.useState<string | null>(null);

  // Fetch position balances
  const {
    data: positions,
    isLoading,
    error,
  } = usePositionBalances({ holder: account, chainId });

  // Collect all conditionIds for enrichment
  const conditionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const pos of positions) {
      for (const pick of pos.pickConfig?.picks ?? []) {
        ids.add(pick.conditionId);
      }
    }
    return Array.from(ids);
  }, [positions]);

  const { map: conditionsMap, isLoading: conditionsLoading } =
    useConditionsByIds(conditionIds);

  // Build rows
  const rows: UIPositionBalance[] = React.useMemo(() => {
    return positions
      .filter((pos) => pos.pickConfig && pos.pickConfig.picks.length > 0)
      .map((pos) => {
        const pc = pos.pickConfig!;
        const isPredictorToken = pos.isPredictorToken;

        const legs = pc.picks.map((pick) =>
          buildLeg(pick, conditionsMap.get(pick.conditionId), isPredictorToken)
        );

        const hasPythLeg = legs.some((leg) => leg.source === 'pyth');

        const totalPool = (() => {
          try {
            return (
              BigInt(pc.totalPredictorCollateral) +
              BigInt(pc.totalCounterpartyCollateral)
            );
          } catch {
            return 0n;
          }
        })();

        const balance = (() => {
          try {
            return BigInt(pos.balance);
          } catch {
            return 0n;
          }
        })();

        return {
          id: pos.id,
          pickConfigId: pc.id,
          isPredictorToken,
          balance,
          totalPool,
          status: deriveStatus(pc, isPredictorToken),
          endsAt: pc.endsAt ?? null,
          legs,
          hasPythLeg,
          uniqueKey: `${pos.id}-${isPredictorToken ? 'pred' : 'cp'}`,
        };
      });
  }, [positions, conditionsMap]);

  // Apply filters
  const filteredRows = React.useMemo(() => {
    let result = rows;

    // Status filter
    if (filters.status.length > 0 && filters.status.length < 3) {
      result = result.filter((row) => filters.status.includes(row.status));
    }

    // Position size range
    if (
      filters.positionSizeRange[0] > 0 ||
      filters.positionSizeRange[1] < Infinity
    ) {
      result = result.filter((row) => {
        const size = Number(formatEther(row.balance));
        return (
          size >= filters.positionSizeRange[0] &&
          size <= filters.positionSizeRange[1]
        );
      });
    }

    // Date range (days from now based on endsAt)
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      const nowMs = Date.now();
      result = result.filter((row) => {
        if (!row.endsAt) return true;
        const daysFromNow =
          (row.endsAt * 1000 - nowMs) / (1000 * 60 * 60 * 24);
        return (
          daysFromNow >= filters.dateRange[0] &&
          daysFromNow <= filters.dateRange[1]
        );
      });
    }

    // Search term
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter((row) =>
        row.legs.some((leg) => leg.question.toLowerCase().includes(term))
      );
    }

    return result;
  }, [rows, filters]);

  // Selected position for dialog
  const selectedPosition = React.useMemo(() => {
    if (openDialogId === null) return null;
    return rows.find((r) => r.uniqueKey === openDialogId) ?? null;
  }, [rows, openDialogId]);

  // Selected position for share dialog
  const selectedSharePosition = React.useMemo(() => {
    if (openShareId === null) return null;
    return rows.find((r) => r.uniqueKey === openShareId) ?? null;
  }, [rows, openShareId]);

  // Columns
  const columns = React.useMemo<ColumnDef<UIPositionBalance>[]>(
    () => [
      {
        id: 'picks',
        accessorFn: (row) => row.legs.length,
        enableSorting: false,
        header: () => <span className="text-sm font-medium">Picks</span>,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Picks
            </div>
            <PicksSummary
              legs={row.original.legs}
              positionId={row.original.pickConfigId}
              isCounterparty={!row.original.isPredictorToken}
              hasPythLeg={row.original.hasPythLeg}
              marketAddress={row.original.pickConfigId}
              onClick={() => setOpenDialogId(row.original.uniqueKey)}
            />
          </div>
        ),
      },
      {
        id: 'side',
        enableSorting: false,
        header: () => <span className="text-sm font-medium">Side</span>,
        cell: ({ row }) => (
          <div>
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Side
            </div>
            <Badge
              variant={row.original.isPredictorToken ? 'default' : 'secondary'}
            >
              {row.original.isPredictorToken ? 'Predictor' : 'Counterparty'}
            </Badge>
          </div>
        ),
      },
      {
        id: 'positionSize',
        accessorFn: (row) => Number(formatEther(row.balance)),
        header: ({ column }) => (
          <SortableHeader column={column} label="Position Size" />
        ),
        cell: ({ row }) => (
          <div>
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Position Size
            </div>
            <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
              <NumberDisplay
                value={Number(formatEther(row.original.balance))}
                className="tabular-nums text-brand-white font-mono"
              />{' '}
              <span className="tabular-nums text-brand-white font-mono">
                {collateralSymbol}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'totalPool',
        accessorFn: (row) => Number(formatEther(row.totalPool)),
        header: ({ column }) => (
          <SortableHeader column={column} label="Total Pool" />
        ),
        cell: ({ row }) => (
          <div>
            <div className="xl:hidden text-xs text-muted-foreground mb-1">
              Total Pool
            </div>
            <div className="whitespace-nowrap tabular-nums text-brand-white font-mono">
              <NumberDisplay
                value={Number(formatEther(row.original.totalPool))}
                className="tabular-nums text-brand-white font-mono"
              />{' '}
              <span className="tabular-nums text-brand-white font-mono">
                {collateralSymbol}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => {
          if (row.status === 'active' && row.endsAt && row.endsAt * 1000 > Date.now())
            return row.endsAt;
          if (row.status === 'active') return 0;
          if (row.status === 'won') return -1;
          if (row.status === 'lost') return -2;
          return -3;
        },
        header: ({ column }) => (
          <SortableHeader column={column} label="Status" />
        ),
        cell: ({ row }) => {
          const { status, endsAt } = row.original;
          const endMs = endsAt ? endsAt * 1000 : 0;

          const endedAgo =
            endsAt && endMs <= Date.now()
              ? formatDistanceToNow(new Date(endMs), { addSuffix: true })
              : null;

          const content = (() => {
            if (status === 'active' && endsAt && endMs > Date.now()) {
              return <CountdownCell endTime={endsAt} />;
            }
            if (status === 'won') {
              return (
                <span className="inline-flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-yes/40 bg-yes/10 text-yes">
                    WON
                  </span>
                  {endedAgo && (
                    <span className="text-muted-foreground text-xs">
                      {endedAgo}
                    </span>
                  )}
                </span>
              );
            }
            if (status === 'lost') {
              return (
                <span className="inline-flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-no/40 bg-no/10 text-no">
                    LOST
                  </span>
                  {endedAgo && (
                    <span className="text-muted-foreground text-xs">
                      {endedAgo}
                    </span>
                  )}
                </span>
              );
            }
            // Active but ended
            if (endedAgo) {
              return (
                <span className="inline-flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-foreground/40 bg-foreground/10 text-foreground">
                    PENDING
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {endedAgo}
                  </span>
                </span>
              );
            }
            return (
              <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                PENDING
              </span>
            );
          })();

          return (
            <div className="whitespace-nowrap">
              <div className="xl:hidden text-xs text-muted-foreground mb-1">
                Status
              </div>
              {content}
            </div>
          );
        },
      },
      {
        id: 'share',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="whitespace-nowrap mt-6 xl:mt-0 flex justify-start xl:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
              onClick={() => setOpenShareId(row.original.uniqueKey)}
            >
              Share
            </button>
          </div>
        ),
      },
    ],
    [collateralSymbol]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.uniqueKey,
  });

  const isDataLoading = isLoading || conditionsLoading;

  if (isDataLoading && rows.length === 0) {
    return (
      <div>
        <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
          {leftSlot}
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
          {leftSlot}
        </div>
        <div className="text-destructive text-center py-8">
          Error loading positions
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
        {leftSlot}
        <div className="flex-1">
          <PositionsTableFilters
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </div>

      <div className="overflow-hidden bg-brand-black relative">
        {isDataLoading && rows.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-24 bg-brand-black/50 h-full animate-in fade-in duration-150">
            <Loader className="w-5 h-5" />
          </div>
        )}
        <Table className="w-full table-auto">
          <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === 'picks' ? '' : 'whitespace-nowrap'
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
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyTabState
                    centered
                    message={
                      rows.length === 0
                        ? 'No positions found'
                        : 'No positions match your filters'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="group xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top hover:bg-muted/50"
              >
                {(() => {
                  const cells = row.getVisibleCells();
                  const pairedIds = new Set([
                    'positionSize',
                    'totalPool',
                    'status',
                    'share',
                  ]);
                  const result: React.ReactNode[] = [];
                  let i = 0;
                  while (i < cells.length) {
                    const cell = cells[i];
                    // Pair numeric columns in a 2-col grid on mobile
                    if (
                      pairedIds.has(cell.column.id) &&
                      i + 1 < cells.length &&
                      pairedIds.has(cells[i + 1].column.id)
                    ) {
                      const next = cells[i + 1];
                      result.push(
                        <TableCell
                          key={cell.id}
                          colSpan={2}
                          className="block xl:hidden px-0 py-0"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-brand-white whitespace-nowrap">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                            <div className="text-brand-white whitespace-nowrap">
                              {flexRender(
                                next.column.columnDef.cell,
                                next.getContext()
                              )}
                            </div>
                          </div>
                        </TableCell>
                      );
                      // Also render individually for desktop
                      result.push(
                        <TableCell
                          key={`${cell.id}-xl`}
                          className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      );
                      result.push(
                        <TableCell
                          key={`${next.id}-xl`}
                          className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                        >
                          {flexRender(
                            next.column.columnDef.cell,
                            next.getContext()
                          )}
                        </TableCell>
                      );
                      i += 2;
                    } else {
                      result.push(
                        <TableCell
                          key={cell.id}
                          className={`block xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${
                            cell.column.id !== 'picks'
                              ? 'whitespace-nowrap'
                              : ''
                          }`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      );
                      i++;
                    }
                  }
                  return result;
                })()}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EscrowPositionDialog
        open={openDialogId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDialogId(null);
        }}
        position={selectedPosition as EscrowPositionRow | null}
        collateralSymbol={collateralSymbol}
      />

      {selectedSharePosition && (
        <ShareDialog
          question={`Position #${selectedSharePosition.pickConfigId}`}
          legs={selectedSharePosition.legs.map((l) => ({
            question: l.question,
            choice: l.choice,
          }))}
          positionSize={Number(formatEther(selectedSharePosition.balance))}
          payout={Number(formatEther(selectedSharePosition.totalPool))}
          symbol={collateralSymbol}
          open={openShareId !== null}
          onOpenChange={(open) => {
            if (!open) setOpenShareId(null);
          }}
        />
      )}
    </div>
  );
}
