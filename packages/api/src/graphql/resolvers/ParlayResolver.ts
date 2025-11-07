import { Resolver, Query, Arg, Int, ObjectType, Field } from 'type-graphql';
import prisma from '../../db';
import { Prisma, Parlay } from '../../../generated/prisma';

@ObjectType()
class ConditionSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => String, { nullable: true })
  shortName?: string | null;

  @Field(() => Int, { nullable: true })
  endTime?: number | null;
}

@ObjectType()
class PredictedOutcomeType {
  @Field(() => String)
  conditionId!: string;

  @Field(() => Boolean)
  prediction!: boolean;

  @Field(() => ConditionSummary, { nullable: true })
  condition?: ConditionSummary | null;
}

@ObjectType()
class ParlayType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  maker!: string;

  @Field(() => String)
  taker!: string;

  @Field(() => String)
  makerNftTokenId!: string;

  @Field(() => String)
  takerNftTokenId!: string;

  @Field(() => String)
  totalCollateral!: string;

  @Field(() => String, { nullable: true })
  makerCollateral?: string | null;

  @Field(() => String, { nullable: true })
  takerCollateral?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => String)
  status!: 'active' | 'settled' | 'consolidated';

  @Field(() => Boolean, { nullable: true })
  makerWon?: boolean | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PredictedOutcomeType])
  predictedOutcomes!: PredictedOutcomeType[];
}

@Resolver()
export class ParlayResolver {
  @Query(() => Int)
  async userParlaysCount(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const addr = address.toLowerCase();
    const where: Prisma.ParlayWhereInput = {
      OR: [{ maker: addr }, { taker: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    const count = await prisma.parlay.count({ where });
    return count;
  }

  @Query(() => [ParlayType])
  async userParlays(
    @Arg('address', () => String) address: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('orderBy', () => String, { nullable: true }) orderBy?: string,
    @Arg('orderDirection', () => String, { nullable: true })
    orderDirection?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<ParlayType[]> {
    const addr = address.toLowerCase();

    // Helper function to process rows and return ParlayType[]
    const processRows = async (rows: Parlay[]): Promise<ParlayType[]> => {
      // Collect condition ids
      const conditionSet = new Set<string>();
      for (const r of rows) {
        // Parse predictedOutcomes if it's a string (from raw SQL)
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomes =
          (predictedOutcomesParsed as unknown as { conditionId: string }[]) ||
          [];
        for (const o of outcomes) conditionSet.add(o.conditionId);
      }
      const conditionIds = Array.from(conditionSet);
      const conditions = conditionIds.length
        ? await prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            select: {
              id: true,
              question: true,
              shortName: true,
              endTime: true,
            },
          })
        : [];
      const condMap = new Map(conditions.map((c) => [c.id, c]));

      return rows.map((r) => {
        // Parse predictedOutcomes if it's a string (from raw SQL)
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomesRaw =
          (predictedOutcomesParsed as unknown as {
            conditionId: string;
            prediction: boolean;
          }[]) || [];
        const outcomes: PredictedOutcomeType[] = outcomesRaw.map((o) => ({
          conditionId: o.conditionId,
          prediction: o.prediction,
          condition: condMap.get(o.conditionId) || null,
        }));
        return {
          id: r.id,
          chainId: r.chainId,
          marketAddress: r.marketAddress,
          maker: r.maker,
          taker: r.taker,
          makerNftTokenId: r.makerNftTokenId,
          takerNftTokenId: r.takerNftTokenId,
          totalCollateral: r.totalCollateral,
          makerCollateral: r.makerCollateral ?? null,
          takerCollateral: r.takerCollateral ?? null,
          refCode: r.refCode,
          status: r.status as unknown as ParlayType['status'],
          makerWon: r.makerWon,
          mintedAt: r.mintedAt,
          settledAt: r.settledAt ?? null,
          endsAt: r.endsAt ?? null,
          predictedOutcomes: outcomes,
        };
      });
    };

    // For numeric/calculated sorting (wager, toWin, pnl), we need raw SQL
    if (orderBy === 'wager' || orderBy === 'toWin' || orderBy === 'pnl') {
      const direction = orderDirection === 'asc' ? 'ASC' : 'DESC';

      if (orderBy === 'wager') {
        // For wager, sort by the viewer's individual collateral
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Parlay[]>`
            SELECT * FROM parlay
            WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN LOWER(maker) = ${addr} THEN CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
              WHEN LOWER(taker) = ${addr} THEN CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Parlay[]>`
            SELECT * FROM parlay
            WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
            ORDER BY CASE 
              WHEN LOWER(maker) = ${addr} THEN CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
              WHEN LOWER(taker) = ${addr} THEN CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      if (orderBy === 'pnl') {
        // For PnL, calculate profit/loss based on whether user is maker/taker and won/lost
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Parlay[]>`
            SELECT * FROM parlay
            WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(maker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(taker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Parlay[]>`
            SELECT * FROM parlay
            WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(maker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(taker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      // For toWin, sort by totalCollateral but treat lost parlays as 0
      if (chainId !== undefined && chainId !== null) {
        const rows = await prisma.$queryRaw<Parlay[]>`
          SELECT * FROM parlay
          WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(maker) = ${addr} AND "makerWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(taker) = ${addr} AND "makerWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
                ELSE 0
              END
            ELSE 0
          END ${Prisma.raw(direction)}
          LIMIT ${take}
          OFFSET ${skip}
        `;
        return processRows(rows);
      } else {
        const rows = await prisma.$queryRaw<Parlay[]>`
          SELECT * FROM parlay
          WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(maker) = ${addr} AND "makerWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(taker) = ${addr} AND "makerWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
                ELSE 0
              END
            ELSE 0
          END ${Prisma.raw(direction)}
          LIMIT ${take}
          OFFSET ${skip}
        `;
        return processRows(rows);
      }
    }

    // For other sorting (like 'created'), use normal Prisma orderBy
    let orderByClause: Prisma.ParlayOrderByWithRelationInput = {
      mintedAt: 'desc',
    }; // default

    if (orderBy === 'created') {
      orderByClause = { mintedAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    }

    const where: Prisma.ParlayWhereInput = {
      OR: [{ maker: addr }, { taker: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }

    const rows = await prisma.parlay.findMany({
      where,
      orderBy: orderByClause,
      take,
      skip,
    });

    return processRows(rows);
  }
}
