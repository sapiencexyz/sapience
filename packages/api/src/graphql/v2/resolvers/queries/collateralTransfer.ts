/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `collateralTransfer(id:)` / `collateralTransfers(...)`.
 *
 * Default order is `TIMESTAMP DESC`; cursor uses `(timestamp, id)` for
 * a stable keyset.
 */

import { contracts } from '@sapience/sdk/contracts';
import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';
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

/**
 * Best-effort list of protocol-controlled addresses on a given chain.
 * Includes vault primaries + their legacy aliases. Used by
 * `filter.excludeProtocol`.
 */
const protocolAddresses = (chainId: number): string[] => {
  try {
    const vaults =
      (contracts as any)?.predictionMarketVault?.filter?.(
        (v: any) => v.chainId === chainId
      ) ?? [];
    const addrs: string[] = [];
    for (const v of vaults) {
      if (v.address) addrs.push(String(v.address).toLowerCase());
      for (const le of v.legacy ?? []) {
        const addr = typeof le === 'string' ? le : (le?.address ?? '');
        if (addr) addrs.push(String(addr).toLowerCase());
      }
    }
    return Array.from(new Set(addrs));
  } catch {
    return [];
  }
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
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

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
    const excluded = protocolAddresses(args.filter.chainId);
    if (excluded.length > 0) {
      const exclusion: Prisma.CollateralTransferWhereInput = {
        AND: [{ from: { notIn: excluded } }, { to: { notIn: excluded } }],
      };
      where.AND = where.AND
        ? [...(where.AND as Prisma.CollateralTransferWhereInput[]), exclusion]
        : [exclusion];
    }
  }

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.CollateralTransferWhereInput = where;
  if (cursorPayload) {
    const op = direction === 'desc' ? 'lt' : 'gt';
    const keyValue =
      field === 'timestamp'
        ? new Date(cursorPayload.k)
        : Number(cursorPayload.k);
    pageWhere = {
      AND: [
        where,
        {
          OR: [
            {
              [field]: { [op]: keyValue },
            } as Prisma.CollateralTransferWhereInput,
            {
              AND: [
                {
                  [field]: { equals: keyValue },
                } as Prisma.CollateralTransferWhereInput,
                { id: { [op]: Number(cursorPayload.id) } },
              ],
            },
          ],
        },
      ],
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.collateralTransfer.findMany({
      where: pageWhere,
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
    }),
    prisma.collateralTransfer.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k:
        field === 'timestamp'
          ? row.timestamp.toISOString()
          : String(row.blockNumber),
      id: String(row.id),
    }),
  }));

  return {
    edges,
    nodes: pageRows,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
