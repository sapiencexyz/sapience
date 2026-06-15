export interface Line {
  id: string;
  kind: 'row' | 'col' | 'diag';
  label: string;
  /** Indices into the 16-cell card, in reading order. */
  cellIndices: [number, number, number, number];
}

export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const LINES_PER_CARD = 10;

/** 4 rows + 4 cols + 2 diagonals = 10 lines. Same order as the frontend. */
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
