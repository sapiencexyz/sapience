import type { PythPrediction } from '@sapience/ui';

export interface DialogSelection {
  conditionId: string;
  question: string;
  prediction: boolean;
}

export interface DialogPick {
  conditionId: string;
  question: string;
  choice: 'Yes' | 'No' | 'Over' | 'Under';
  source: 'polymarket' | 'pyth';
}

/**
 * Build the picks array for the share dialog from both Polymarket selections
 * and Pyth predictions. Pyth picks always predict YES on-chain — the
 * direction (over/under) is encoded in the conditionId, so the choice label
 * reflects that direction rather than Yes/No.
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
    question: `${p.priceFeedLabel ?? 'Crypto'} ${p.direction === 'over' ? '>' : '<'} $${p.targetPrice.toLocaleString()}`,
    choice: p.direction === 'over' ? 'Over' : 'Under',
    source: 'pyth',
  }));
  return [...polymarketPicks, ...pythPicks];
}
