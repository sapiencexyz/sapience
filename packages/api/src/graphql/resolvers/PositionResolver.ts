import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Position, Prisma } from '../../../generated/prisma';
import prisma from '../../db';

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

  @Field(() => String, { nullable: true })
  resolver?: string | null;

  @Field(() => Boolean)
  settled!: boolean;

  @Field(() => Boolean)
  resolvedToYes!: boolean;
}

@ObjectType()
class PredictionType {
  @Field(() => String)
  conditionId!: string;

  @Field(() => Boolean)
  outcomeYes!: boolean;

  @Field(() => Int, { nullable: true })
  chainId?: number | null;

  @Field(() => ConditionSummary, { nullable: true })
  condition?: ConditionSummary | null;
}

@ObjectType()
class PositionType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  predictor!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  predictorNftTokenId!: string;

  @Field(() => String)
  counterpartyNftTokenId!: string;

  @Field(() => String)
  totalCollateral!: string;

  @Field(() => String, { nullable: true })
  predictorCollateral?: string | null;

  @Field(() => String, { nullable: true })
  counterpartyCollateral?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => String)
  status!: 'active' | 'settled' | 'consolidated';

  @Field(() => Boolean, { nullable: true })
  predictorWon?: boolean | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PredictionType])
  predictions!: PredictionType[];
}

@Resolver()
export class PositionResolver {
  @Query(() => Int)
  async positionsCount(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const addr = address.toLowerCase();
    const where: Prisma.PositionWhereInput = {
      OR: [{ predictor: addr }, { counterparty: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    return prisma.position.count({ where });
  }

  @Query(() => [PositionType])
  async positions(
    @Arg('address', () => String) address: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('orderBy', () => String, { nullable: true }) orderBy?: string,
    @Arg('orderDirection', () => String, { nullable: true })
    orderDirection?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('status', () => String, { nullable: true })
    status?: 'active' | 'settled' | 'consolidated',
    @Arg('endsAtGte', () => Int, { nullable: true }) endsAtGte?: number
  ): Promise<PositionType[]> {
    const addr = address.toLowerCase();

    const buildPredictionMap = async (
      rows: Position[]
    ): Promise<Map<number, PredictionType[]>> => {
      const positionIds = rows.map((r) => r.id);
      if (positionIds.length === 0) return new Map();

      const predictions = await prisma.prediction.findMany({
        where: { positionId: { in: positionIds } },
        include: {
          condition: {
            select: {
              id: true,
              question: true,
              shortName: true,
              endTime: true,
              resolver: true,
              settled: true,
              resolvedToYes: true,
            },
          },
        },
      });

      const map = new Map<number, PredictionType[]>();
      for (const p of predictions) {
        if (!p.positionId) continue;
        const condition = p.condition && {
          id: p.condition.id,
          question: p.condition.question ?? null,
          shortName: p.condition.shortName ?? null,
          endTime: p.condition.endTime ?? null,
          resolver: p.condition.resolver ?? null,
          settled: p.condition.settled,
          resolvedToYes: p.condition.resolvedToYes,
        };
        const entry: PredictionType = {
          conditionId: p.conditionId,
          outcomeYes: p.outcomeYes,
          chainId: p.chainId ?? null,
          condition: condition ?? null,
        };
        if (!map.has(p.positionId)) {
          map.set(p.positionId, []);
        }
        map.get(p.positionId)!.push(entry);
      }
      return map;
    };

    const processRows = async (rows: Position[]): Promise<PositionType[]> => {
      const predictionMap = await buildPredictionMap(rows);

      return rows.map((r) => ({
        id: r.id,
        chainId: r.chainId,
        marketAddress: r.marketAddress,
        predictor: r.predictor,
        counterparty: r.counterparty,
        predictorNftTokenId: r.predictorNftTokenId,
        counterpartyNftTokenId: r.counterpartyNftTokenId,
        totalCollateral: r.totalCollateral,
        predictorCollateral: r.predictorCollateral ?? null,
        counterpartyCollateral: r.counterpartyCollateral ?? null,
        refCode: r.refCode,
        status: r.status as unknown as PositionType['status'],
        predictorWon: r.predictorWon,
        mintedAt: r.mintedAt,
        settledAt: r.settledAt ?? null,
        endsAt: r.endsAt ?? null,
        predictions: predictionMap.get(r.id) ?? [],
      }));
    };

    if (orderBy === 'wager' || orderBy === 'toWin' || orderBy === 'pnl') {
      const direction = orderDirection === 'asc' ? 'ASC' : 'DESC';

      const validStatuses = ['active', 'settled', 'consolidated'] as const;
      const sanitizedStatus =
        status && validStatuses.includes(status) ? status : null;
      const statusCondition = sanitizedStatus
        ? `AND status = '${sanitizedStatus}'`
        : '';

      const sanitizedEndsAtGte =
        endsAtGte !== undefined &&
        endsAtGte !== null &&
        Number.isInteger(endsAtGte)
          ? endsAtGte
          : null;
      const endsAtCondition = sanitizedEndsAtGte
        ? `AND "endsAt" >= ${sanitizedEndsAtGte}`
        : '';

      const extraConditions = `${statusCondition} ${endsAtCondition}`;

      if (orderBy === 'wager') {
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId} ${Prisma.raw(extraConditions)}
            ORDER BY CASE 
              WHEN LOWER(predictor) = ${addr} THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
              WHEN LOWER(counterparty) = ${addr} THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) ${Prisma.raw(extraConditions)}
            ORDER BY CASE 
              WHEN LOWER(predictor) = ${addr} THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
              WHEN LOWER(counterparty) = ${addr} THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      if (orderBy === 'pnl') {
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId} ${Prisma.raw(extraConditions)}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(predictor) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(counterparty) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) ${Prisma.raw(extraConditions)}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(predictor) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(counterparty) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      // For toWin, sort by totalCollateral but treat lost positions as 0
      if (chainId !== undefined && chainId !== null) {
        const rows = await prisma.$queryRaw<Position[]>`
          SELECT * FROM position
          WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId} ${Prisma.raw(extraConditions)}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(predictor) = ${addr} AND "predictorWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(counterparty) = ${addr} AND "predictorWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
                ELSE 0
              END
            ELSE 0
          END ${Prisma.raw(direction)}
          LIMIT ${take}
          OFFSET ${skip}
        `;
        return processRows(rows);
      } else {
        const rows = await prisma.$queryRaw<Position[]>`
          SELECT * FROM position
          WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) ${Prisma.raw(extraConditions)}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(predictor) = ${addr} AND "predictorWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(counterparty) = ${addr} AND "predictorWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
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

    let orderByClause: Prisma.PositionOrderByWithRelationInput = {
      mintedAt: 'desc',
    };

    if (orderBy === 'created') {
      orderByClause = { mintedAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    }

    const where: Prisma.PositionWhereInput = {
      OR: [{ predictor: addr }, { counterparty: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (status) {
      where.status = status;
    }
    if (endsAtGte !== undefined && endsAtGte !== null) {
      where.endsAt = { gte: endsAtGte };
    }

    const rows = await prisma.position.findMany({
      where,
      orderBy: orderByClause,
      take,
      skip,
    });

    return processRows(rows);
  }

  @Query(() => [PositionType])
  async positionsByConditionId(
    @Arg('conditionId', () => String) conditionId: string,
    @Arg('take', () => Int, { defaultValue: 100 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('status', () => String, { nullable: true })
    status?: 'active' | 'settled' | 'consolidated',
    @Arg('endsAtGte', () => Int, { nullable: true }) endsAtGte?: number
  ): Promise<PositionType[]> {
    const predictionMatches = await prisma.prediction.findMany({
      where: {
        positionId: { not: null },
        conditionId: { equals: conditionId, mode: 'insensitive' },
        ...(chainId !== undefined && chainId !== null
          ? { chainId }
          : undefined),
      },
      select: { positionId: true },
    });

    const positionIds = Array.from(
      new Set(
        predictionMatches
          .map((p) => p.positionId)
          .filter((id): id is number => id !== null)
      )
    );

    if (positionIds.length === 0) return [];

    const positionWhere: Prisma.PositionWhereInput = {
      id: { in: positionIds },
      ...(chainId !== undefined && chainId !== null ? { chainId } : undefined),
      ...(status ? { status } : undefined),
      ...(endsAtGte !== undefined && endsAtGte !== null
        ? { endsAt: { gte: endsAtGte } }
        : undefined),
    };

    const rows = await prisma.position.findMany({
      where: positionWhere,
      orderBy: { mintedAt: 'desc' },
      take,
      skip,
    });

    const predictionMap = await prisma.prediction.findMany({
      where: { positionId: { in: rows.map((r) => r.id) } },
      include: {
        condition: {
          select: {
            id: true,
            question: true,
            shortName: true,
            endTime: true,
            resolver: true,
            settled: true,
            resolvedToYes: true,
          },
        },
      },
    });

    const map = new Map<number, PredictionType[]>();
    for (const p of predictionMap) {
      if (!p.positionId) continue;
      const condition = p.condition && {
        id: p.condition.id,
        question: p.condition.question ?? null,
        shortName: p.condition.shortName ?? null,
        endTime: p.condition.endTime ?? null,
        resolver: p.condition.resolver ?? null,
        settled: p.condition.settled,
        resolvedToYes: p.condition.resolvedToYes,
      };
      const entry: PredictionType = {
        conditionId: p.conditionId,
        outcomeYes: p.outcomeYes,
        chainId: p.chainId ?? null,
        condition: condition ?? null,
      };
      if (!map.has(p.positionId)) {
        map.set(p.positionId, []);
      }
      map.get(p.positionId)!.push(entry);
    }

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorNftTokenId: r.predictorNftTokenId,
      counterpartyNftTokenId: r.counterpartyNftTokenId,
      totalCollateral: r.totalCollateral,
      predictorCollateral: r.predictorCollateral ?? null,
      counterpartyCollateral: r.counterpartyCollateral ?? null,
      refCode: r.refCode,
      status: r.status as unknown as PositionType['status'],
      predictorWon: r.predictorWon,
      mintedAt: r.mintedAt,
      settledAt: r.settledAt ?? null,
      endsAt: r.endsAt ?? null,
      predictions: map.get(r.id) ?? [],
    }));
  }
}
