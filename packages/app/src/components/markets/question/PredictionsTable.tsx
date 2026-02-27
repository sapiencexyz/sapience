'use client';

import * as React from 'react';
import { useMemo } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import MarketBadge from '~/components/markets/MarketBadge';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import PercentChance from '~/components/shared/PercentChance';
import type { PredictionData } from './types';

interface PredictionsTableProps {
  data: PredictionData[];
  isLoading?: boolean;
}

export function PredictionsTable({ data, isLoading }: PredictionsTableProps) {
  // Column definitions for predictions table
  const columns: ColumnDef<PredictionData>[] = useMemo(
    () => [
      {
        accessorKey: 'x',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Created
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
        },
        cell: ({ row }) => {
          const timestamp = row.original.x;
          const date = new Date(timestamp);
          const relativeTime = formatDistanceToNow(date, { addSuffix: true });
          const exactTime = date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          });
          return (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground text-sm whitespace-nowrap cursor-help">
                    {relativeTime}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span>{exactTime}</span>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          );
        },
        sortingFn: (rowA, rowB) => rowA.original.x - rowB.original.x,
      },
      {
        accessorKey: 'positionSize',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Position Size
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
        },
        cell: ({ row }) => (
          <span className="text-foreground whitespace-nowrap">
            {row.original.positionSize.toFixed(2)} USDe
          </span>
        ),
        sortingFn: (rowA, rowB) =>
          rowA.original.positionSize - rowB.original.positionSize,
      },
      {
        id: 'impliedForecast',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">Implies</span>
        ),
        cell: ({ row }) => {
          // Calculate implied probability from position sizes
          // Always compute based on predictor vs counterparty position size:
          // - If predictor bets YES: probability of YES = predictorCollateral / totalPositionSize
          // - If predictor bets NO: probability of YES = counterpartyCollateral / totalPositionSize
          const {
            predictorCollateral,
            counterpartyCollateral,
            predictorPrediction,
            combinedPredictions,
            combinedWithYes,
          } = row.original;
          const totalPositionSize =
            predictorCollateral + counterpartyCollateral;
          let impliedPercent = 50; // Default fallback

          if (totalPositionSize > 0) {
            if (predictorPrediction) {
              // Predictor bets YES
              impliedPercent = (predictorCollateral / totalPositionSize) * 100;
            } else {
              // Predictor bets NO: counterparty is on YES
              impliedPercent =
                (counterpartyCollateral / totalPositionSize) * 100;
            }
            impliedPercent = Math.max(0, Math.min(100, impliedPercent));
          }

          return (
            <span className="font-mono whitespace-nowrap text-ethena">
              {combinedPredictions &&
                combinedPredictions.length > 0 &&
                `${combinedWithYes === false ? '<' : '>'}`}
              <PercentChance
                probability={impliedPercent / 100}
                showLabel
                label="chance"
                className="font-mono"
              />
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: 'predictedYes',
        header: () => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Predicted</span>
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0 font-mono"
            >
              YES
            </Badge>
          </div>
        ),
        cell: ({ row }) => {
          const { predictor, counterparty, predictorPrediction } = row.original;
          // predictorPrediction is the submitted forecast; counterparty takes the opposite side
          // If predictor predicts YES, YES address = predictor
          // If predictor predicts NO, YES address = counterparty
          const yesAddress = predictorPrediction ? predictor : counterparty;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <EnsAvatar address={yesAddress} width={16} height={16} />
              <AddressDisplay address={yesAddress} compact />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'predictedNo',
        header: () => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Predicted</span>
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0 font-mono"
            >
              NO
            </Badge>
          </div>
        ),
        cell: ({ row }) => {
          const { predictor, counterparty, predictorPrediction } = row.original;
          // predictorPrediction is the submitted forecast; counterparty takes the opposite side
          // If predictor predicts YES, NO address = counterparty
          // If predictor predicts NO, NO address = predictor
          const noAddress = predictorPrediction ? counterparty : predictor;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <EnsAvatar address={noAddress} width={16} height={16} />
              <AddressDisplay address={noAddress} compact />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'combinedPrediction',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Combined with
          </span>
        ),
        cell: ({ row }) => {
          const { combinedPredictions, combinedWithYes } = row.original;

          if (!combinedPredictions || combinedPredictions.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }

          const count = combinedPredictions.length;
          const getCategoryColor = (slug?: string) =>
            getCategoryStyle(slug).color;

          return (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
                >
                  {count} prediction{count !== 1 ? 's' : ''}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                align="start"
              >
                <div className="flex flex-col divide-y divide-brand-white/20">
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="text-base font-medium text-brand-white">
                      Predicted with
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                        combinedWithYes
                          ? 'border-yes/40 bg-yes/10 text-yes'
                          : 'border-no/40 bg-no/10 text-no'
                      }`}
                    >
                      {combinedWithYes ? 'YES' : 'NO'}
                    </Badge>
                  </div>
                  {combinedPredictions.map((pred, i) => (
                    <div
                      key={`combined-${i}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <MarketBadge
                        label={pred.question}
                        size={32}
                        color={getCategoryColor(pred.categorySlug)}
                        categorySlug={pred.categorySlug}
                      />
                      <span className="text-sm flex-1 min-w-0 font-mono underline decoration-dotted underline-offset-2 hover:text-brand-white/80 transition-colors cursor-pointer truncate">
                        {pred.question}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                          pred.prediction
                            ? 'border-yes/40 bg-yes/10 text-yes'
                            : 'border-no/40 bg-no/10 text-no'
                        }`}
                      >
                        {pred.prediction ? 'YES' : 'NO'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        enableSorting: false,
      },
    ],
    []
  );

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'x', desc: true },
  ]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <span className="text-muted-foreground text-sm">
          No predictions yet
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full min-w-0">
      <Table className="w-full">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:!bg-background bg-background border-b border-border"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="px-4 py-1 text-left text-sm font-medium text-muted-foreground"
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
        <TableBody className="bg-brand-black">
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-b border-border hover:bg-brand-white/5 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No predictions yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
