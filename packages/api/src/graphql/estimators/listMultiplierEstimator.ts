/**
 * List multiplier complexity estimator
 *
 * Multiplies child complexity by the list size argument (`take` /
 * `first` / `limit`) so cost analysis reflects "how many rows the
 * resolver will materialize", not just the depth of the selection set.
 *
 * Four cases are recognized:
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
 *
 * 3. `*Connection` envelope fields — `tradesConnection: TradeConnection!`.
 *    Relay-shaped sibling of `*Page` with `first` instead of `take` and
 *    two inner list fields (`nodes: [X!]!`, `edges: [XEdge!]!`) instead
 *    of `items`. Same multiplier mechanism, applied to whichever inner
 *    list the client selected.
 *
 * 4. The `items` field inside a `*Page` envelope, or `nodes` / `edges`
 *    inside a `*Connection` envelope — passthrough. The envelope above
 *    already applied the `take` / `first` multiplier, so treating the
 *    inner list as a normal list would double-count: `take *
 *    defaultListSize` rows instead of `take`. A paginated query with
 *    a fat selection set would price 10× higher than the equivalent
 *    deprecated bare-array. Returning `childComplexity` here lets the
 *    envelope's multiplier stand alone.
 */
import {
  isListType,
  getNullableType,
  getNamedType,
  GraphQLObjectType,
  GraphQLCompositeType,
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

const isItemsFieldOfPageEnvelope = (
  fieldName: string,
  parentType: GraphQLCompositeType
): boolean => {
  if (fieldName !== 'items') return false;
  if (!(parentType instanceof GraphQLObjectType)) return false;
  // The `Page` interface itself has `items: [Node!]!` but is never the
  // concrete return type of a query field — only concrete `*Page`
  // objects implement it. Excluding the interface name keeps us aligned
  // with `fieldReturnsPageEnvelope` above.
  if (parentType.name === 'Page' || !parentType.name.endsWith('Page')) {
    return false;
  }
  return true;
};

// Relay-style `*Connection` envelopes carry two inner list fields —
// `nodes: [X!]!` and `edges: [XEdge!]!`. Recognize either as the
// envelope's list shape; both need passthrough so `first` doesn't
// double-multiply with `defaultListSize`.
const fieldReturnsConnectionEnvelope = (field: {
  type: import('graphql').GraphQLOutputType;
}): boolean => {
  const named = getNamedType(field.type);
  if (!(named instanceof GraphQLObjectType)) return false;
  if (named.name === 'Connection' || !named.name.endsWith('Connection')) {
    return false;
  }
  const fields = named.getFields();
  const nodes = fields.nodes;
  const edges = fields.edges;
  const nodesIsList = nodes != null && isListType(getNullableType(nodes.type));
  const edgesIsList = edges != null && isListType(getNullableType(edges.type));
  return nodesIsList || edgesIsList;
};

const isInnerListFieldOfConnectionEnvelope = (
  fieldName: string,
  parentType: GraphQLCompositeType
): boolean => {
  if (fieldName !== 'nodes' && fieldName !== 'edges') return false;
  if (!(parentType instanceof GraphQLObjectType)) return false;
  if (
    parentType.name === 'Connection' ||
    !parentType.name.endsWith('Connection')
  ) {
    return false;
  }
  return true;
};

export function listMultiplierEstimator(
  options?: ListMultiplierEstimatorOptions
): ComplexityEstimator {
  const defaultListSize = options?.defaultListSize ?? 10;
  const maxListSize = options?.maxListSize ?? 1000;

  return (args) => {
    const { field, args: fieldArgs, childComplexity, type, node } = args;

    const isListField = isListType(getNullableType(field.type));
    const isPageEnvelope = !isListField && fieldReturnsPageEnvelope(field);
    const isConnectionEnvelope =
      !isListField && !isPageEnvelope && fieldReturnsConnectionEnvelope(field);

    if (!isListField && !isPageEnvelope && !isConnectionEnvelope) {
      // Not a list or *Page / *Connection envelope, let other estimators handle.
      return undefined;
    }

    // The `items` field inside a *Page envelope, or the `nodes` / `edges`
    // fields inside a *Connection envelope, are passthroughs — multiplying
    // here on top of the envelope's `take` / `first` would double-count.
    if (
      isListField &&
      (isItemsFieldOfPageEnvelope(node.name.value, type) ||
        isInnerListFieldOfConnectionEnvelope(node.name.value, type))
    ) {
      return 1 + childComplexity;
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
