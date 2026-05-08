/**
 * Deprecated bare-array form of accountActivity. Replaced by
 * `accountActivityPage` (returns `{ items, hasMore }` for server-truth
 * pagination). Logic lives in `runAccountActivity` in the live file.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runAccountActivity } from '../activity';

export const accountActivity: NonNullable<
  QueryResolvers['accountActivity']
> = async (_parent, args, ctx) => {
  const { items } = await runAccountActivity(args, ctx);
  return items;
};
