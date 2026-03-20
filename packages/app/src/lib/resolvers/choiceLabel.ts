import { OutcomeSide } from '@sapience/sdk/types';

/**
 * Map a predicted outcome to a human-readable choice label.
 * Always returns Yes/No for all resolver types.
 */
export function getChoiceLabel(predictedOutcome: number): string {
  const isYesSide = (predictedOutcome as OutcomeSide) === OutcomeSide.YES;
  return isYesSide ? 'Yes' : 'No';
}
