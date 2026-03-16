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
    const extensions = args.field.extensions as Readonly<
      Record<string, unknown>
    >;
    if (extensions) {
      if (typeof extensions.complexity === 'number') {
        return args.childComplexity + extensions.complexity;
      } else if (typeof extensions.complexity === 'function') {
        return (
          extensions.complexity as (args: ComplexityEstimatorArgs) => number
        )(args);
      }
    }
    // Return undefined to let the next estimator handle it
    return undefined;
  };
}
