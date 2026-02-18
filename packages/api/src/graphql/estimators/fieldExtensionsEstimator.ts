/**
 * Field extensions complexity estimator
 * Reads complexity from field.extensions.complexity
 * Adapted from graphql-query-complexity
 */
import type {
  ComplexityEstimator,
  ComplexityEstimatorArgs,
} from '../queryComplexity.js';

export function fieldExtensionsEstimator(): ComplexityEstimator {
  return (args: ComplexityEstimatorArgs) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extensions = args.field.extensions as any;
    if (extensions) {
      if (typeof extensions.complexity === 'number') {
        return args.childComplexity + extensions.complexity;
      } else if (typeof extensions.complexity === 'function') {
        return extensions.complexity(args);
      }
    }
    // Return undefined to let the next estimator handle it
    return undefined;
  };
}
