/**
 * AttestationsPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { AttestationsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const AttestationsPage: AttestationsPageResolvers = {
  totalCount: lazyTotalCount(prisma.attestation),
};
