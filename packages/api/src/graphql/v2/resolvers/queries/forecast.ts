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
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
} from '../../relay/connection';

export const forecast = async (_parent: unknown, { uid }: { uid: string }) =>
  prisma.attestation.findUnique({ where: { uid } });

type Field = 'ATTESTED_AT' | 'CREATED_AT';
const FIELD_TO_PRISMA: Record<Field, 'time' | 'createdAt'> = {
  ATTESTED_AT: 'time',
  CREATED_AT: 'createdAt',
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
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'ATTESTED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

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

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.AttestationWhereInput>({
        orderField: field,
        orderValue:
          field === 'createdAt' ? new Date(cursor.k) : Number(cursor.k),
        idField: 'uid',
        idValue: cursor.id,
        direction,
      })
    : null;

  const [rows, totalCount] = await Promise.all([
    prisma.attestation.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { uid: direction }],
      take: first + 1,
    }),
    prisma.attestation.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row) =>
      encodeCursor({
        k:
          field === 'createdAt'
            ? row.createdAt.toISOString()
            : String(row.time),
        id: row.uid,
      }),
  });
};
