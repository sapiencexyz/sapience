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

    // Single SQL aggregation instead of loading all positions into memory
    const [result] = await prisma.$queryRaw<VolumeRow[]>`
      SELECT COALESCE(SUM(
        CASE WHEN LOWER(predictor) = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE 0 END
        +
        CASE WHEN LOWER(counterparty) = ${addr}
             THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE 0 END
      ), 0)::TEXT as total
      FROM position
      WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
    `;

    return result?.total ?? '0';
  }
}
