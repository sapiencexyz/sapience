/**
 * Deprecated escrow-system queries:
 *
 *   - positions / predictions / pickConfigurations — replaced by their
 *     `*Page` counterparts (server-truth `hasMore` + lazy `totalCount`).
 *     Logic lives in `runPositions` / `runPredictions` /
 *     `runPickConfigurations` in the live `../escrow.ts`; these
 *     wrappers discard the envelope and return the bare items array
 *     for backwards compatibility.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runPickConfigurations, runPositions, runPredictions } from '../escrow';

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args
) => {
  const { items } = await runPositions(args);
  return items;
};

export const predictions: NonNullable<QueryResolvers['predictions']> = async (
  _parent,
  args
) => {
  const { items } = await runPredictions(args);
  return items;
};

export const pickConfigurations: NonNullable<
  QueryResolvers['pickConfigurations']
> = async (_parent, args) => {
  const { items } = await runPickConfigurations(args);
  return items;
};
