/**
 * Deprecated `collateralTransfers(limit:, offset:)` resolver — replaced
 * by `collateralTransfersPage(take:, skip:)`. The wrapper translates
 * limit/offset → take/skip and discards `hasMore`.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import { runCollateralTransfers } from '../collateralBalance';

export const collateralTransfers: NonNullable<
  QueryResolvers['collateralTransfers']
> = async (_parent, { address, chainId, excludeProtocol, limit, offset }) => {
  logDeprecatedHit('collateralTransfers');
  const { items } = await runCollateralTransfers({
    address,
    chainId,
    excludeProtocol,
    take: limit,
    skip: offset,
  });
  return items;
};
