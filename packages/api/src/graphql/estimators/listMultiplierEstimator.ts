/**
 * List multiplier complexity estimator
 * Multiplies child complexity by list size arguments (take, first, limit)
 * This captures the N+1 query nature of nested lists
 */
import { isListType, getNullableType } from 'graphql';
import type { ComplexityEstimator } from '../queryComplexity.js';

export interface ListMultiplierEstimatorOptions {
  defaultListSize?: number;
  maxListSize?: number;
}

export function listMultiplierEstimator(
  options?: ListMultiplierEstimatorOptions
): ComplexityEstimator {
  const defaultListSize = options?.defaultListSize ?? 10;
  const maxListSize = options?.maxListSize ?? 1000;

  return (args) => {
    const { field, args: fieldArgs, childComplexity } = args;

    // Check if this is a list field (unwrap NonNull wrapper if present)
    const isListField = isListType(getNullableType(field.type));

    if (!isListField) {
      // Not a list, use default complexity (let other estimators handle)
      return undefined;
    }

    // Get the list size from arguments
    let listSize = defaultListSize;

    // Check common pagination argument names
    const takeArg = fieldArgs.take ?? fieldArgs.first ?? fieldArgs.limit;
    if (typeof takeArg === 'number' && takeArg > 0) {
      listSize = Math.min(takeArg, maxListSize);
    }

    // For list fields, multiply child complexity by list size
    // Add 1 for the field itself
    return 1 + childComplexity * listSize;
  };
}
