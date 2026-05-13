/**
 * Deprecated escrow-system queries:
 *
 *   - positions — replaced by `positionsPage` (server-truth `hasMore`
 *     + lazy `totalCount`). Logic lives in `runPositions` in the live
 *     `../escrow.ts`; this wrapper just discards the envelope and
 *     returns the items array for backwards compatibility.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runPositions } from '../escrow';

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args,
  ctx
) => {
  const { items } = await runPositions(args, ctx);
  return items;
};
