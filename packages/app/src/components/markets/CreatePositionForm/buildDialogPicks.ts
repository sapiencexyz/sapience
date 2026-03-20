import type { PythPrediction } from '@sapience/ui';

export interface DialogSelection {
  conditionId: string;
  question: string;
  prediction: boolean;
}

export interface DialogPick {
  conditionId: string;
  question: string;
  choice: 'Yes' | 'No';
  source: 'polymarket' | 'pyth';
}

/**
 * Build the picks array for the share dialog from both Polymarket selections
 * and Pyth predictions. All picks use Yes/No choice labels. Pyth questions
 * always use ">" framing (e.g., "BTC > $71,080") — YES means over.
 */
export function buildDialogPicks(
  selections: DialogSelection[],
  pythPredictions: PythPrediction[]
): DialogPick[] {
  const polymarketPicks: DialogPick[] = selections.map((s) => ({
    conditionId: s.conditionId,
    question: s.question,
    choice: s.prediction ? 'Yes' : 'No',
    source: 'polymarket',
  }));
  const pythPicks: DialogPick[] = pythPredictions.map((p) => ({
    conditionId: p.id,
    question: `${p.priceFeedLabel ?? 'Crypto'} > $${p.targetPrice.toLocaleString()}`,
    choice: p.direction === 'over' ? 'Yes' : 'No',
    source: 'pyth',
  }));
  return [...polymarketPicks, ...pythPicks];
}
