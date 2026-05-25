/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `forecast(uid:)` / `forecasts(...)` — EAS attestation lookups.
 *
 * The Prisma column for "when the forecast was made" is `time`; v2's
 * public field is `attestedAt`. Cursor encoding uses the public name
 * so the on-wire cursor matches the orderBy field; resolver maps to
 * `time` only at the Prisma boundary.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

export const forecast = async (_parent: unknown, { uid }: { uid: string }) =>
  prisma.attestation.findUnique({ where: { uid } });

type Field = 'ATTESTED_AT' | 'CREATED_AT';
const FIELD_TO_PRISMA: Record<Field, 'time' | 'createdAt'> = {
  ATTESTED_AT: 'time',
  CREATED_AT: 'createdAt',
};

const buildCursorPredicate = (
  k: string,
  cursorId: string,
  field: 'time' | 'createdAt',
  direction: 'asc' | 'desc'
): Prisma.AttestationWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const keyValue = field === 'createdAt' ? new Date(k) : Number(k);
  return {
    OR: [
      { [field]: { [op]: keyValue } } as Prisma.AttestationWhereInput,
      {
        AND: [
          { [field]: { equals: keyValue } } as Prisma.AttestationWhereInput,
          { uid: { [op]: cursorId } } as Prisma.AttestationWhereInput,
        ],
      },
    ],
  };
};

export const forecasts = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      uid?: string | null;
      forecaster?: string | null;
      recipient?: string | null;
      conditionId?: string | null;
      conditionIds?: string[] | null;
      schemaId?: string | null;
      attestedAt?: { gte?: number | null; lte?: number | null } | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'ATTESTED_AT'];
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where: Prisma.AttestationWhereInput = {};
  if (args.filter?.uid) where.uid = args.filter.uid;
  if (args.filter?.forecaster)
    where.attester = args.filter.forecaster.toLowerCase();
  if (args.filter?.recipient)
    where.recipient = args.filter.recipient.toLowerCase();
  if (args.filter?.conditionId)
    where.conditionId = args.filter.conditionId.toLowerCase();
  if (args.filter?.conditionIds?.length)
    where.conditionId = {
      in: args.filter.conditionIds.map((id) => id.toLowerCase()),
    };
  if (args.filter?.schemaId) where.schemaId = args.filter.schemaId;
  if (args.filter?.attestedAt) {
    const r: Prisma.IntFilter = {};
    if (args.filter.attestedAt.gte != null) r.gte = args.filter.attestedAt.gte;
    if (args.filter.attestedAt.lte != null) r.lte = args.filter.attestedAt.lte;
    where.time = r;
  }

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursorPayload
    ? buildCursorPredicate(cursorPayload.k, cursorPayload.id, field, direction)
    : null;
  const pageWhere = cursorWhere ? { AND: [where, cursorWhere] } : where;

  const [rows, totalCount] = await Promise.all([
    prisma.attestation.findMany({
      where: pageWhere,
      orderBy: [{ [field]: direction } as any, { uid: direction }],
      take: first + 1,
    }),
    prisma.attestation.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k: field === 'createdAt' ? row.createdAt.toISOString() : String(row.time),
      id: row.uid,
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
