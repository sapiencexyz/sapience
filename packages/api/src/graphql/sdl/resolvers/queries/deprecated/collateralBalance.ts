/**
 * Deprecated bare-array form of collateralTransfers. Replaced by
 * `collateralTransfersPage`. Logic lives in `runCollateralTransfers`
 * in the live file.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runCollateralTransfers } from '../collateralBalance';

export const collateralTransfers: NonNullable<
  QueryResolvers['collateralTransfers']
> = async (_parent, args) => {
  const { items } = await runCollateralTransfers(args);
  return items;
};
