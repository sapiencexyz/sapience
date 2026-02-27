import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';

interface VolumeRow {
  total: string;
}

@Resolver()
export class VolumeResolver {
  @Query(() => String)
  async tradingVolumeByAddress(
    @Arg('address', () => String) address: string
  ): Promise<string> {
    const addr = address.toLowerCase();

    // V1 legacy positions + V2 predictions aggregated per address
    const [result] = await prisma.$queryRaw<VolumeRow[]>`
      SELECT COALESCE(SUM(vol), 0)::TEXT as total
      FROM (
        SELECT
          CASE WHEN LOWER(predictor) = ${addr}
               THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
               ELSE 0 END
          +
          CASE WHEN LOWER(counterparty) = ${addr}
               THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
               ELSE 0 END
          AS vol
        FROM position
        WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
        UNION ALL
        SELECT
          CASE WHEN LOWER(predictor) = ${addr}
               THEN CAST("predictorCollateral" AS DECIMAL)
               ELSE 0 END
          +
          CASE WHEN LOWER(counterparty) = ${addr}
               THEN CAST("counterpartyCollateral" AS DECIMAL)
               ELSE 0 END
          AS vol
        FROM "Prediction"
        WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
      ) combined
    `;

    return result?.total ?? '0';
  }
}
