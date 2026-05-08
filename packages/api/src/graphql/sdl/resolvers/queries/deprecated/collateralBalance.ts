/**
 * Deprecated bare-array form of collateralTransfers. Replaced by
 * `collateralTransfersPage`. Logic lives in `runCollateralTransfers`
 * in the live file.
 *
 * Translates the legacy `limit`/`offset` arg names to the canonical
 * `take`/`skip` shape that runCollateralTransfers expects.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runCollateralTransfers } from '../collateralBalance';

export const collateralTransfers: NonNullable<
  QueryResolvers['collateralTransfers']
> = async (_parent, { address, chainId, excludeProtocol, limit, offset }) => {
  const { items } = await runCollateralTransfers({
    address,
    chainId,
    excludeProtocol,
    take: limit,
    skip: offset,
  });
  return items;
};
