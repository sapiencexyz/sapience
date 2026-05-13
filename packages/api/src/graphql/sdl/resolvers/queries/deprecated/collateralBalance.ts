/**
 * Deprecated `collateralTransfers(limit:, offset:)` resolver — replaced
 * by `collateralTransfersPage(take:, skip:)`. The wrapper translates
 * limit/offset → take/skip and discards `hasMore`.
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
