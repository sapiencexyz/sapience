import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';

interface VolumeRow {
  total: string;
}

@Resolver()
export class VolumeResolver {
  @Query(() => String, {
    description:
      'Total lifetime trading volume in wei for the given address across all prediction types',
  })
  async accountTotalVolume(
    @Arg('address', () => String) address: string
  ): Promise<string> {
    const addr = address.toLowerCase();

    // Legacy positions + escrow predictions aggregated per address
    // Addresses are stored lowercase by indexers, so no LOWER() needed
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
  }
}
