/**
 * Query.accountTotalVolume — lifetime trading volume in wei for an
 * address, summed across legacy `position` rows and the newer
 * `Prediction` table. Either side of a position (predictor or
 * counterparty) contributes its collateral if the address matches.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';

interface VolumeRow {
  total: string;
}

export const accountTotalVolume: NonNullable<
  QueryResolvers['accountTotalVolume']
> = async (_parent, { address }) => {
  const addr = address.toLowerCase();
  // Addresses are stored lowercase by indexers, so no LOWER() needed.
  const [result] = await prisma.$queryRaw<VolumeRow[]>`
    SELECT COALESCE(SUM(vol), 0)::TEXT as total
    FROM (
      SELECT
        CASE WHEN predictor = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE 0 END
        +
        CASE WHEN counterparty = ${addr}
             THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE 0 END
        AS vol
      FROM position
      WHERE predictor = ${addr} OR counterparty = ${addr}
      UNION ALL
      SELECT
        CASE WHEN predictor = ${addr}
             THEN CAST("predictorCollateral" AS DECIMAL)
             ELSE 0 END
        +
        CASE WHEN counterparty = ${addr}
             THEN CAST("counterpartyCollateral" AS DECIMAL)
             ELSE 0 END
        AS vol
      FROM "Prediction"
      WHERE predictor = ${addr} OR counterparty = ${addr}
    ) combined
  `;
  return result?.total ?? '0';
};
