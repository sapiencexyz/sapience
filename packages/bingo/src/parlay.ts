import type { BingoCondition } from './api';

export type Side = 'YES' | 'NO';
export type LineKind = 'row' | 'col' | 'diag';

export interface Line {
  id: string;
  kind: LineKind;
  label: string;
  /** indices into the 16-cell card, in reading order */
  cellIndices: [number, number, number, number];
}

export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** 4 rows + 4 cols + 2 diagonals = 10 lines. */
export function buildLines(): Line[] {
  const lines: Line[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    lines.push({
      id: `row-${r}`,
      kind: 'row',
      label: `Row ${r + 1}`,
      cellIndices: [0, 1, 2, 3].map(
        (c) => r * GRID_SIZE + c,
      ) as Line['cellIndices'],
    });
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    lines.push({
      id: `col-${c}`,
      kind: 'col',
      label: `Col ${c + 1}`,
      cellIndices: [0, 1, 2, 3].map(
        (r) => r * GRID_SIZE + c,
      ) as Line['cellIndices'],
    });
  }
  lines.push({
    id: 'diag-tl-br',
    kind: 'diag',
    label: 'Diag ↘',
    cellIndices: [0, 5, 10, 15],
  });
  lines.push({
    id: 'diag-tr-bl',
    kind: 'diag',
    label: 'Diag ↙',
    cellIndices: [3, 6, 9, 12],
  });
  return lines;
}

/**
 * Synthetic per-line payout calc.
 *  - wager = tier / 10 (10 lines split the card evenly)
 *  - payout = wager / product(p_i)
 * where p_i = picked-side probability for each of the 4 legs.
 */
export function computeLinePayout(
  line: Line,
  conditions: BingoCondition[],
  picks: Side[],
  tier: number,
): { wager: number; payout: number; combinedOdds: number } {
  const wager = tier / 10;
  let product = 1;
  for (const idx of line.cellIndices) {
    const p = picks[idx] === 'YES'
      ? conditions[idx].estimatedPrice
      : 1 - conditions[idx].estimatedPrice;
    product *= Math.max(0.02, Math.min(0.98, p));
  }
  const combinedOdds = 1 / product;
  const payout = wager * combinedOdds;
  return { wager, payout, combinedOdds };
}
