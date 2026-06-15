/**
 * Numeric open-interest ordering for `conditions(...)`.
 *
 * `openInterest` is stored as VarChar; Prisma `orderBy` would sort
 * lexicographically. This path uses `::numeric` in SQL (matching v1
 * `questions` and the `IDX_condition_oi_numeric` index).
 */

import { Prisma } from '../../../../../generated/prisma';
import type { Condition } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import type { OrderDirection } from '../../relay/connection';

export const findConditionsOrderByOpenInterest = async ({
  whereSql,
  needsCategoryJoin,
  direction,
  take,
  skip,
}: {
  whereSql: Prisma.Sql;
  needsCategoryJoin: boolean;
  direction: OrderDirection;
  take: number;
  skip: number;
}): Promise<Condition[]> => {
  const orderDir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const categoryJoin = needsCategoryJoin
    ? Prisma.sql`INNER JOIN category cat ON cat.id = c."categoryId"`
    : Prisma.empty;

  return prisma.$queryRaw<Condition[]>`
    SELECT c.*
    FROM condition c
    ${categoryJoin}
    WHERE ${whereSql}
    ORDER BY c."openInterest"::numeric ${orderDir}, c.id ${orderDir}
    LIMIT ${take}
    OFFSET ${skip}
  `;
};
