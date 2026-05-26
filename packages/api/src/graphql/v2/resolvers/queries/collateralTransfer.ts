/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `collateralTransfer(id:)` / `collateralTransfers(...)`.
 *
 * Default order is `TIMESTAMP DESC`; cursor uses `(timestamp, id)` for
 * a stable keyset.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { getConfiguredVaultDeploymentAddresses } from '../../../../services/protocolStats/vaultConfig';
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

export const collateralTransfer = async (
  _parent: unknown,
  { id }: { id: string }
) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'CollateralTransfer') return null;
  const rowId = Number(parts.id);
  if (!Number.isInteger(rowId)) return null;
  return prisma.collateralTransfer.findUnique({ where: { id: rowId } });
};

type Field = 'BLOCK_NUMBER' | 'TIMESTAMP';
const FIELD_TO_PRISMA: Record<Field, 'blockNumber' | 'timestamp'> = {
  BLOCK_NUMBER: 'blockNumber',
  TIMESTAMP: 'timestamp',
};

export const collateralTransfers = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      account?: string | null;
      chainId?: number | null;
      timestamp?: { gte?: string | null; lte?: string | null } | null;
      transactionHash?: string | null;
      excludeProtocol?: boolean | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 100, {
    defaultTake: 100,
    maxTake: 100,
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
    if (args.filter.timestamp.gte) r.gte = new Date(args.filter.timestamp.gte);
    if (args.filter.timestamp.lte) r.lte = new Date(args.filter.timestamp.lte);
    where.timestamp = r;
  }
  if (args.filter?.excludeProtocol && args.filter?.chainId != null) {
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

  const [rows, totalCount] = await Promise.all([
    prisma.collateralTransfer.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
    }),
    prisma.collateralTransfer.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
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
