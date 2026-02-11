/**
 * Field cost estimator
 * Assigns custom complexity costs to specific fields by name or pattern
 */
import type { ComplexityEstimator } from '../queryComplexity.js';

export type FieldCostConfig =
  | { [fieldName: string]: number }
  | ((fieldName: string) => number | undefined);

export function fieldCostEstimator(
  costs: FieldCostConfig
): ComplexityEstimator {
  return (args) => {
    const fieldName = args.node.name.value;

    let cost: number | undefined;
    if (typeof costs === 'function') {
      cost = costs(fieldName);
    } else {
      cost = costs[fieldName];
    }

    if (typeof cost === 'number') {
      return cost + args.childComplexity;
    }

    // Return undefined to let the next estimator handle it
    return undefined;
  };
}
