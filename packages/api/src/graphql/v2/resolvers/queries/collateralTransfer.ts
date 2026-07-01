/**
 * `collateralTransfer(id:)` / `collateralTransfers(...)`.
 *
 * Default order is `TIMESTAMP DESC`; cursor uses `(timestamp, id)` for
 * a stable keyset.
 */

import { GraphQLError } from 'graphql';
import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { getConfiguredVaultDeploymentAddresses } from '../../../../services/protocolStats/vaultConfig';
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
} from '../../relay/connection';
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const collateralTransfer: NonNullable<
  QueryResolvers['collateralTransfer']
> = async (_parent, { id }) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'CollateralTransfer') return null;
  const [chainId, transactionHash, logIndex] = parts.id.split(':');
  const c = Number(chainId);
  const l = Number(logIndex);
  if (!transactionHash || !Number.isInteger(c) || !Number.isInteger(l))
    return null;
  return prisma.collateralTransfer.findUnique({
    where: {
      chainId_transactionHash_logIndex: {
        chainId: c,
        transactionHash,
        logIndex: l,
      },
    },
  });
};

const FIELD_TO_PRISMA: Record<string, 'blockNumber' | 'timestamp'> = {
  BLOCK_NUMBER: 'blockNumber',
  TIMESTAMP: 'timestamp',
};

export const collateralTransfers: NonNullable<
  QueryResolvers['collateralTransfers']
> = async (_parent, args) => {
  const first = clampTake(args.first ?? 25, {
    defaultTake: 25,
    maxTake: 25,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'TIMESTAMP'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.CollateralTransferWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.transactionHash)
    where.transactionHash = args.filter.transactionHash.toLowerCase();
  if (args.filter?.account) {
    const addr = args.filter.account.toLowerCase();
    where.OR = [{ from: addr }, { to: addr }];
  }
  if (args.filter?.timestamp) {
    const r: Prisma.DateTimeFilter = {};
    if (args.filter.timestamp.gte)
      r.gte = new Date(args.filter.timestamp.gte as unknown as string);
    if (args.filter.timestamp.lte)
      r.lte = new Date(args.filter.timestamp.lte as unknown as string);
    where.timestamp = r;
  }
  if (args.filter?.excludeProtocol) {
    // The protocol vault set is chain-scoped, so excludeProtocol is
    // meaningless without a chainId. Surface that instead of silently
    // returning over-inclusive (protocol-included) data.
    if (args.filter?.chainId == null) {
      throw new GraphQLError(
        'collateralTransfers(filter.excludeProtocol) requires filter.chainId.',
        { extensions: { code: 'BAD_USER_INPUT' } }
      );
    }
    const excluded = getConfiguredVaultDeploymentAddresses(args.filter.chainId);
    if (excluded.length > 0) {
      const exclusion: Prisma.CollateralTransferWhereInput = {
        AND: [{ from: { notIn: excluded } }, { to: { notIn: excluded } }],
      };
      where.AND = where.AND
        ? [...(where.AND as Prisma.CollateralTransferWhereInput[]), exclusion]
        : [exclusion];
    }
  }

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.CollateralTransferWhereInput>({
        orderField: field,
        orderValue:
          field === 'timestamp' ? new Date(cursor.k) : Number(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const rows = await prisma.collateralTransfer.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      {
        [field]: direction,
      } as Prisma.CollateralTransferOrderByWithRelationInput,
      { id: direction },
    ],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.collateralTransfer.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k:
          field === 'timestamp'
            ? row.timestamp.toISOString()
            : String(row.blockNumber),
        id: String(row.id),
      }),
  });
};
