import { useEffect, useMemo, useState } from 'react';
import type {
  Position as PositionType,
  Transaction as TransactionType,
} from '@sapience/ui/types/graphql';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import { formatUnits } from 'viem';
import Link from 'next/link';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { getChainShortName } from '~/lib/utils/util';
import ShareDialog from '~/components/shared/ShareDialog';
import { buildTradeShareParams } from '~/lib/share/buildTradeShareParams';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { MINIMUM_POSITION_WIN } from '~/lib/constants/numbers';

interface ClosedTraderPositionsTableProps {
  positions: PositionType[];
}

function toNumberFromUnits(
  value: string | null | undefined,
  decimals: number | undefined
): number {
  try {
    const d =
      typeof decimals === 'number' && Number.isFinite(decimals) ? decimals : 18;
    const v = value ?? '0';
    return Number(formatUnits(BigInt(v), d));
  } catch {
    return 0;
  }
}

function computeCashflowEntryExit(
  transactions: TransactionType[],
  decimals: number | undefined
): { entry: number; exit: number; closedAt?: Date } {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { entry: 0, exit: 0 };
  }
  let entry = 0;
  let exit = 0;
  let lastTs: number | undefined;

  for (const tx of transactions) {
    const deltaRaw = tx?.collateralTransfer?.collateral ?? null;
    if (deltaRaw == null) continue;
    const delta = toNumberFromUnits(deltaRaw, decimals);
    if (delta > 0)
      entry += delta; // deposits into position
    else if (delta < 0) exit += Math.abs(delta); // withdrawals to user (sales/settlement)
    const ts = new Date(tx.createdAt).getTime();
    if (!Number.isNaN(ts)) lastTs = lastTs == null ? ts : Math.max(lastTs, ts);
  }

  return { entry, exit, closedAt: lastTs ? new Date(lastTs) : undefined };
}

export default function ClosedTraderPositionsTable({
  positions,
}: ClosedTraderPositionsTableProps) {
  interface RowData {
    id: string | number;
    positionId?: number | string | null;
    position: PositionType;
    link?: string;
    question: string;
    symbol: string;
    decimals: number;
    entry: number;
    exit: number;
    realized: number;
    closedAt?: Date;
    isLost: boolean;
  }

  const rows: RowData[] = useMemo(() => {
    return (positions || []).map((p) => {
      const symbol = p.market?.marketGroup?.collateralSymbol || 'tokens';
      const decimals = p.market?.marketGroup?.collateralDecimals || 18;
      const marketId = p.market?.marketId;
      const marketAddr = p.market?.marketGroup?.address || '';
      const chainId = p.market?.marketGroup?.chainId || 0;
      const question = p.market?.question || '';
      const chainShortName = chainId ? getChainShortName(chainId) : 'unknown';
      const link =
        marketAddr && marketId != null
          ? `/markets/${chainShortName}:${marketAddr}/${marketId}`
          : undefined;

      const { entry, exit, closedAt } = computeCashflowEntryExit(
        p.transactions || [],
        decimals
      );
      const realized = exit - entry;
      let minWinThreshold = 0;
      try {
        minWinThreshold = Number(formatUnits(MINIMUM_POSITION_WIN, decimals));
      } catch {
        minWinThreshold = 0.01; // fallback for typical 18 decimals
      }
      const isLost = exit < minWinThreshold;

      return {
        id: p.id,
        positionId: p.positionId,
        position: p,
        link,
        question,
        symbol,
        decimals,
        entry,
        exit,
        realized,
        closedAt,
        isLost,
      };
    });
  }, [positions]);

  if (!rows.length) {
    return (
      <div className="rounded border bg-card p-6 text-sm text-muted-foreground">
        No closed trades
      </div>
    );
  }

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'position', desc: true },
  ]);

  const [openSharePositionId, setOpenSharePositionId] = useState<
    number | string | null
  >(null);
  const [selectedPositionSnapshot, setSelectedPositionSnapshot] =
    useState<PositionType | null>(null);
  // ---
  const selectedRow = useMemo(() => {
    if (openSharePositionId === null) return null;
    return (
      rows.find((r) => String(r.positionId) === String(openSharePositionId)) ||
      null
    );
  }, [rows, openSharePositionId]);
  useEffect(() => {
    if (openSharePositionId === null) return;
    if (selectedRow?.position) {
      setSelectedPositionSnapshot(selectedRow.position);
      // ---
    } else {
      // ---
    }
  }, [openSharePositionId, selectedRow]);

  const columns: ColumnDef<RowData>[] = [
    {
      id: 'position',
      accessorFn: (row) => (row.closedAt ? row.closedAt.getTime() : 0),
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
        const r = row.original;
        return (
          <div className="space-y-2">
            <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
              {r.link ? (
                <Link href={r.link} className="group">
                  <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                    {r.question || `#${r.positionId}`}
                  </span>
                </Link>
              ) : (
                <span>{r.question || `#${r.positionId}`}</span>
              )}
            </h2>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>
                {`Position #${r.positionId} closed ${
                  r.closedAt
                    ? r.closedAt.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      })
                    : '—'
                }`}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'entry',
      accessorFn: (row) => row.entry,
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
        const r = row.original;
        return (
          <span className="whitespace-nowrap">
            <NumberDisplay value={r.entry} /> {r.symbol}
          </span>
        );
      },
    },
    {
      id: 'exit',
      accessorFn: (row) => row.exit,
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
          To Win
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
        const r = row.original;
        return (
          <span className="whitespace-nowrap">
            <NumberDisplay value={r.exit} /> {r.symbol}
          </span>
        );
      },
    },
    {
      id: 'realized',
      accessorFn: (row) => row.realized,
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
          Realized Profit/Loss
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
        const r = row.original;
        const pct = r.entry > 0 ? (r.realized / r.entry) * 100 : 0;
        return (
          <span className="whitespace-nowrap">
            <NumberDisplay value={r.realized} /> {r.symbol}{' '}
            {r.entry > 0 ? (
              <small
                className={r.realized >= 0 ? 'text-green-600' : 'text-red-600'}
              >
                ({pct.toFixed(2)}%)
              </small>
            ) : null}
          </span>
        );
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => null,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="whitespace-nowrap text-right">
            {r.isLost ? (
              <Button size="sm" variant="outline" disabled>
                Wager Lost
              </Button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                onClick={() => {
                  setSelectedPositionSnapshot(r.position);
                  setOpenSharePositionId(r.positionId || null);
                  // ---
                }}
              >
                Share
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetAll: false,
  });

  return (
    <div className="rounded border bg-card overflow-hidden">
      <Table className="table-auto">
        <TableHeader className="bg-muted/30 text-sm font-medium text-muted-foreground border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.id === 'actions' ? 'text-right' : undefined}
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
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === 'position' ? 'max-w-[360px]' : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedPositionSnapshot &&
        (() => {
          const params = buildTradeShareParams(selectedPositionSnapshot, {
            wagerOverride: selectedRow?.entry,
            payoutOverride: selectedRow?.exit,
          });
          return (
            <ShareDialog
              imagePath="/og/trade"
              title="Share Your Wager"
              open={openSharePositionId !== null}
              onOpenChange={(next) => {
                if (!next) setOpenSharePositionId(null);
              }}
              trigger={<span />}
              {...params}
            />
          );
        })()}
    </div>
  );
}
