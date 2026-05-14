/**
 * List multiplier complexity estimator
 *
 * Multiplies child complexity by the list size argument (`take` /
 * `first` / `limit`) so cost analysis reflects "how many rows the
 * resolver will materialize", not just the depth of the selection set.
 *
 * Two cases are recognized:
 *
 * 1. Direct list fields — `predictions: [Prediction!]!`. The deprecated
 *    bare-array shape. Take comes from the field's own args.
 *
 * 2. `*Page` envelope fields — `predictionsPage: PredictionsPage!`.
 *    These return an object whose `items` selection is the list. The
 *    `take` arg lives on the *Page field itself, not on `items`, so the
 *    default behavior would silently fall through to `defaultComplexity:
 *    1` and the deprecated bare-array would always cost more than the
 *    new paginated equivalent — backwards. We treat any field whose
 *    named return type ends in `Page` (and exposes an `items: [X!]!`
 *    field, matching the SDL contract test) as a list of `take` rows
 *    so the two shapes price equivalently.
 */
import {
  isListType,
  getNullableType,
  getNamedType,
  GraphQLObjectType,
} from 'graphql';
import type { ComplexityEstimator } from '../queryComplexity.js';

export interface ListMultiplierEstimatorOptions {
  defaultListSize?: number;
  maxListSize?: number;
}

const fieldReturnsPageEnvelope = (field: {
  type: import('graphql').GraphQLOutputType;
}): boolean => {
  const named = getNamedType(field.type);
  if (!(named instanceof GraphQLObjectType)) return false;
  // The `Page` interface itself doesn't follow the *Page naming —
  // every concrete page does. Match the convention enforced by the
  // SDL contract test (schema.test.ts).
  if (named.name === 'Page' || !named.name.endsWith('Page')) return false;
  const items = named.getFields().items;
  if (!items) return false;
  return isListType(getNullableType(items.type));
};

export function listMultiplierEstimator(
  options?: ListMultiplierEstimatorOptions
): ComplexityEstimator {
  const defaultListSize = options?.defaultListSize ?? 10;
  const maxListSize = options?.maxListSize ?? 1000;

  return (args) => {
    const { field, args: fieldArgs, childComplexity } = args;

    const isListField = isListType(getNullableType(field.type));
    const isPageEnvelope = !isListField && fieldReturnsPageEnvelope(field);

    if (!isListField && !isPageEnvelope) {
      // Not a list or *Page envelope, let other estimators handle.
      return undefined;
    }

    // Read the list size from the field's own args. *Page fields keep
    // the `take` on the envelope (not on `items`), so this works for
    // both shapes.
    let listSize = defaultListSize;
    const takeArg = fieldArgs.take ?? fieldArgs.first ?? fieldArgs.limit;
    if (typeof takeArg === 'number' && takeArg > 0) {
      listSize = Math.min(takeArg, maxListSize);
    }

    return 1 + childComplexity * listSize;
  };
}
