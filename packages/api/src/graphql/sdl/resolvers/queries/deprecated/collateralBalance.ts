/**
 * Deprecated `collateralTransfers(limit:, offset:)` resolver — replaced
 * by `collateralTransfersConnection(first:, after:)`. The wrapper translates
 * limit/offset → take/skip and discards `hasMore`.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import {
  mapCollateralTransfer,
  runCollateralTransfers,
} from '../collateralBalance';

const collateralTransfersImpl = async (
  _parent: unknown,
  {
    address,
    chainId,
    excludeProtocol,
    limit,
    offset,
  }: {
    address: string;
    chainId: number;
    excludeProtocol?: boolean | null;
    limit?: number | null;
    offset?: number | null;
  }
) => {
  logDeprecatedHit('collateralTransfers');
  const { items } = await runCollateralTransfers({
    address,
    chainId,
    excludeProtocol,
    take: limit,
    skip: offset,
  });
  return items.map((item) => mapCollateralTransfer(item, address));
};

export const collateralTransfers =
  collateralTransfersImpl as unknown as NonNullable<
    QueryResolvers['collateralTransfers']
  >;
