'use client';

import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import type { UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';

type RowComponent = (props: {
  tx: UiTransaction;
  collateralAssetTicker?: string | null;
  sortedMarketsForColors: any[];
}) => JSX.Element;

export interface FeedRow {
  Comp: RowComponent;
  key: string | number;
  tx: UiTransaction;
  collateralAssetTicker?: string | null;
  sortedMarketsForColors: any[];
}

type SortKey =
  | 'time'
  | 'action'
  | 'address'
  | 'amount'
  | 'position'
  | 'question';
type SortDir = 'asc' | 'desc';

function sortAccessor(row: FeedRow, key: SortKey): string | number {
  const { tx } = row;
  switch (key) {
    case 'time': {
      return new Date(tx.createdAt).getTime();
    }
    case 'action': {
      return (tx.type || '').toString().toLowerCase();
    }
    case 'address': {
      const lowerType = String(tx.type || '').toLowerCase();
      const eventLog: any = (tx as any)?.event?.logData || {};
      const fallbackMaker: string =
        typeof eventLog?.maker === 'string' ? eventLog.maker : '';
      const owner =
        tx?.position?.owner ||
        (lowerType.includes('mintparlay') ? fallbackMaker : '') ||
        '';
      return owner.toString().toLowerCase();
    }
    case 'amount': {
      try {
        const raw =
          (tx as any)?.collateralTransfer?.collateral ??
          (tx as any)?.position?.collateral ??
          tx.collateral;
        // Convert from wei assuming string decimal, keep as number for sort
        const big = BigInt(raw || '0');
        // Avoid importing viem on the client just to sort; compare BigInt directly
        return Number(big);
      } catch {
        return 0;
      }
    }
    case 'position': {
      const id = Number((tx as any)?.position?.positionId ?? 0);
      return Number.isFinite(id) ? id : 0;
    }
    case 'question': {
      const lowerType = String(tx.type || '').toLowerCase();
      const normalizedType = lowerType.replace(/[^a-z]/g, '');
      if (normalizedType.includes('mintparlay')) {
        const eventLog: any = (tx as any)?.event?.logData || {};
        const outcomes = Array.isArray(eventLog?.predictedOutcomes)
          ? eventLog.predictedOutcomes
          : [];
        const first = outcomes[0] || {};
        const text = (
          first.shortName ||
          first.question ||
          first.conditionId ||
          ''
        )
          .toString()
          .toLowerCase();
        return text;
      }
      const q = (tx as any)?.position?.market?.marketGroup?.question || '';
      return String(q).toLowerCase();
    }
    default:
      return 0;
  }
}

export default function FeedTable({ rows }: { rows: FeedRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(nextKey);
      setSortDir('asc');
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortAccessor(a, sortKey);
      const bv = sortAccessor(b, sortKey);
      let cmp = 0;
      if (av < bv) cmp = -1;
      else if (av > bv) cmp = 1;
      // Stable tie-breakers to ensure visible change when values equal
      if (cmp === 0) {
        const at = new Date(a.tx.createdAt || 0).getTime();
        const bt = new Date(b.tx.createdAt || 0).getTime();
        if (at !== bt) cmp = at < bt ? -1 : 1;
        else cmp = String(a.key).localeCompare(String(b.key));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function HeaderButton({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sk)}
        className={`inline-flex items-center gap-1 text-left font-medium hover:text-foreground ${active ? 'text-foreground' : ''}`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === 'asc' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm [&>thead>tr>th:nth-child(2)]:w-[320px] [&>tbody>tr>td:nth-child(2)]:w-[320px] [&>thead>tr>th:nth-child(6)]:w-[250px] [&>tbody>tr>td:nth-child(6)>div]:max-w-[250px] [&>tbody>tr>td:nth-child(6)>div]:truncate">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr className="border-b">
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'time'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Time" sk="time" />
            </th>
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'question'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Question" sk="question" />
            </th>
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'action'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Signal" sk="action" />
            </th>
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'amount'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Amount" sk="amount" />
            </th>
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'address'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Address" sk="address" />
            </th>
            <th
              className="px-4 py-3 text-left align-middle"
              aria-sort={
                sortKey === 'position'
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <HeaderButton label="Position" sk="position" />
            </th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {sortedRows.map(
              ({
                Comp,
                key,
                tx,
                collateralAssetTicker,
                sortedMarketsForColors,
              }) => (
                <Comp
                  key={key}
                  tx={tx}
                  collateralAssetTicker={collateralAssetTicker}
                  sortedMarketsForColors={sortedMarketsForColors}
                />
              )
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
