/**
 * `forecast(uid:)` / `forecasts(...)` — EAS forecast attestation queries.
 *
 * Cursor key is `(time, uid)` — backed by the `IDX_attestation_time_uid`
 * index. `uid` is unique so the tie-break is canonical.
 *
 * Column-casing notes (per the EAS indexer's write path):
 *   - `attester` is stored CHECKSUMMED (viem log args), so the filter
 *     matches case-insensitively rather than lowercasing the input.
 *   - `uid` / `conditionId` / `schemaId` are stored lowercase hex, so
 *     those filters lowercase the input and match exactly.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
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

export const forecast: NonNullable<QueryResolvers['forecast']> = async (
  _parent,
  { uid }
) => prisma.attestation.findUnique({ where: { uid: uid.toLowerCase() } });

export const forecasts: NonNullable<QueryResolvers['forecasts']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  // ATTESTED_AT is the only order field; the direction is the only knob.
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.AttestationWhereInput = {};
  if (args.filter?.attester) {
    where.attester = {
      equals: args.filter.attester.toLowerCase(),
      mode: 'insensitive',
    };
  }
  if (args.filter?.conditionIds?.length) {
    where.conditionId = {
      in: args.filter.conditionIds.map((id: string) => id.toLowerCase()),
    };
  }
  if (args.filter?.schemaId)
    where.schemaId = args.filter.schemaId.toLowerCase();

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.AttestationWhereInput>({
        orderField: 'time',
        orderValue: Number(cursor.k),
        idField: 'uid',
        idValue: cursor.id,
        direction,
      })
    : null;

  const rows = await prisma.attestation.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [{ time: direction }, { uid: direction }],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.attestation.count({ where }),
    getCursor: (row) => encodeCursor({ k: String(row.time), id: row.uid }),
  });
};
