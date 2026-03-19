import { OutcomeSide } from '@sapience/sdk/types';
import type { ResolverKind } from './conditionResolver';

/**
 * Map a predicted outcome to a human-readable choice label based on resolver type.
 *
 * Polymarket / ConditionalTokens conditions use Yes/No.
 * Pyth conditions use Over/Under (OutcomeSide.YES = Over, OutcomeSide.NO = Under).
 */
export function getChoiceLabel(
  predictedOutcome: number,
  resolverKind: ResolverKind
): string {
  const isYesSide = (predictedOutcome as OutcomeSide) === OutcomeSide.YES;

  if (resolverKind === 'pyth') {
    return isYesSide ? 'Over' : 'Under';
  }

  return isYesSide ? 'Yes' : 'No';
}
