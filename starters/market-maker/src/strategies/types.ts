// ============================================================================
// Strategy Interface
//
// Every pricing strategy implements this interface. The market maker listener
// (index.ts) routes each auction pick to a strategy based on the pick's
// conditionResolver address, then combines individual probabilities into a
// combo quote.
//
// To add a new strategy:
//   1. Create a new file in this directory (e.g. MyStrategy.ts)
//   2. Implement the Strategy interface below
//   3. Register it in index.ts alongside the existing strategies
// ============================================================================

import type { ConditionById } from '@sapience/sdk/queries';

/** Pricing strategy interface — one implementation per resolver type */
export interface Strategy {
  readonly name: string;

  /** Check if this strategy handles the given resolver address */
  matchesResolver(resolverAddress: string): boolean;

  /**
   * Compute the fair probability that the condition resolves YES (outcome index 0).
   * Returns a number in [0, 1], or null if unable to price.
   */
  getYesProbability(conditionId: string, meta: ConditionById | null): Promise<number | null>;
}

export type { ConditionById };
