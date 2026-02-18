/**
 * Simple complexity estimator
 * Adapted from graphql-query-complexity
 */
import type { ComplexityEstimator } from '../queryComplexity.js';

export interface SimpleEstimatorOptions {
  defaultComplexity?: number;
}

export function simpleEstimator(
  options?: SimpleEstimatorOptions
): ComplexityEstimator {
  const defaultComplexity =
    options && typeof options.defaultComplexity === 'number'
      ? options.defaultComplexity
      : 1;

  return (args) => {
    return defaultComplexity + args.childComplexity;
  };
}
