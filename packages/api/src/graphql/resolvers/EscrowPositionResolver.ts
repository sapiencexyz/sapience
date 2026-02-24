import { Arg, Field, Int, ObjectType, Query, Resolver, registerEnumType } from 'type-graphql';
import { Prisma, V2SettlementResult } from '../../../generated/prisma';
import prisma from '../../db';

registerEnumType(V2SettlementResult, {
  name: 'V2SettlementResultEnum',
  description: 'V2 settlement result — matches on-chain SettlementResult',
});

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType()
class PickType {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => String)
  conditionResolver!: string;

  @Field(() => String)
  conditionId!: string;

  @Field(() => Int)
  predictedOutcome!: number;
}

@ObjectType()
class PicksType {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  totalPredictorCollateral!: string;

  @Field(() => String)
  totalCounterpartyCollateral!: string;

  @Field(() => String)
  claimedPredictorCollateral!: string;

  @Field(() => String)
  claimedCounterpartyCollateral!: string;

  @Field(() => Boolean)
  resolved!: boolean;

  @Field(() => String)
  result!: string;

  @Field(() => Int, { nullable: true })
  resolvedAt?: number | null;

  @Field(() => String, { nullable: true })
  predictorToken?: string | null;

  @Field(() => String, { nullable: true })
  counterpartyToken?: string | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PickType])
  picks!: PickType[];
}

@ObjectType()
class PredictionType {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  predictionId!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  predictor!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  predictorToken!: string;

  @Field(() => String)
  counterpartyToken!: string;

  @Field(() => String)
  predictorCollateral!: string;

  @Field(() => String)
  counterpartyCollateral!: string;

  @Field(() => String, { nullable: true })
  collateralDeposited?: string | null;

  @Field(() => Int, { nullable: true })
  collateralDepositedAt?: number | null;

  @Field(() => Boolean)
  settled!: boolean;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => String)
  result!: string;

  @Field(() => String, { nullable: true })
  predictorClaimable?: string | null;

  @Field(() => String, { nullable: true })
  counterpartyClaimable?: string | null;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  createTxHash!: string;

  @Field(() => String, { nullable: true })
  settleTxHash?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;
}

@ObjectType()
class PositionType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  tokenAddress!: string;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => Boolean)
  isPredictorToken!: boolean;

  @Field(() => String)
  holder!: string;

  @Field(() => String)
  balance!: string;

  @Field(() => PicksType, { nullable: true })
  pickConfig?: PicksType | null;
}

@ObjectType()
class CloseType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => String)
  predictorHolder!: string;

  @Field(() => String)
  counterpartyHolder!: string;

  @Field(() => String)
  predictorTokensBurned!: string;

  @Field(() => String)
  counterpartyTokensBurned!: string;

  @Field(() => String)
  predictorPayout!: string;

  @Field(() => String)
  counterpartyPayout!: string;

  @Field(() => Int)
  burnedAt!: number;

  @Field(() => String)
  txHash!: string;

  @Field(() => String, { nullable: true })
  refCode?: string | null;
}

@ObjectType()
class ClaimType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  predictionId!: string;

  @Field(() => String)
  holder!: string;

  @Field(() => String)
  positionToken!: string;

  @Field(() => String)
  tokensBurned!: string;

  @Field(() => String)
  collateralPaid!: string;

  @Field(() => Int)
  redeemedAt!: number;

  @Field(() => String)
  txHash!: string;

  @Field(() => String, { nullable: true })
  refCode?: string | null;
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class EscrowPositionResolver {
  // -------------------------------------------------------------------------
  // Predictions (escrow-based)
  // -------------------------------------------------------------------------

  @Query(() => Int)
  async predictionsCount(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const addr = address.toLowerCase();
    const where: Prisma.PredictionWhereInput = {
      OR: [{ predictor: addr }, { counterparty: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    return prisma.prediction.count({ where });
  }

  @Query(() => [PredictionType])
  async predictions(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('settled', () => Boolean, { nullable: true }) settled?: boolean,
    @Arg('orderBy', () => String, { nullable: true }) orderBy?: string,
    @Arg('orderDirection', () => String, { nullable: true })
    orderDirection?: string
  ): Promise<PredictionType[]> {
    const addr = address?.toLowerCase();

    const where: Prisma.PredictionWhereInput = {};

    if (addr) {
      where.OR = [{ predictor: addr }, { counterparty: addr }];
    }
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (settled !== undefined && settled !== null) {
      where.settled = settled;
    }

    // If no filters provided, return empty
    if (!addr) {
      return [];
    }

    let orderByClause: Prisma.PredictionOrderByWithRelationInput = {
      createdAt: 'desc',
    };

    if (orderBy === 'createdAt') {
      orderByClause = { createdAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    } else if (orderBy === 'settledAt') {
      orderByClause = { settledAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    }

    const rows = await prisma.prediction.findMany({
      where,
      orderBy: orderByClause,
      take,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorToken: r.predictorToken,
      counterpartyToken: r.counterpartyToken,
      predictorCollateral: r.predictorCollateral,
      counterpartyCollateral: r.counterpartyCollateral,
      collateralDeposited: r.collateralDeposited ?? null,
      collateralDepositedAt: r.collateralDepositedAt ?? null,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      result: r.result,
      predictorClaimable: r.predictorClaimable ?? null,
      counterpartyClaimable: r.counterpartyClaimable ?? null,
      createdAt: r.createdAt.toISOString(),
      createTxHash: r.createTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
    }));
  }

  @Query(() => PredictionType, { nullable: true })
  async prediction(
    @Arg('predictionId', () => String) predictionId: string
  ): Promise<PredictionType | null> {
    const predictionIdLower = predictionId.toLowerCase();

    const r = await prisma.prediction.findUnique({
      where: { predictionId: predictionIdLower },
    });

    if (!r) return null;

    return {
      id: r.id,
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorToken: r.predictorToken,
      counterpartyToken: r.counterpartyToken,
      predictorCollateral: r.predictorCollateral,
      counterpartyCollateral: r.counterpartyCollateral,
      collateralDeposited: r.collateralDeposited ?? null,
      collateralDepositedAt: r.collateralDepositedAt ?? null,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      result: r.result,
      predictorClaimable: r.predictorClaimable ?? null,
      counterpartyClaimable: r.counterpartyClaimable ?? null,
      createdAt: r.createdAt.toISOString(),
      createTxHash: r.createTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Pick Configurations
  // -------------------------------------------------------------------------

  @Query(() => [PicksType])
  async pickConfigurations(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('resolved', () => Boolean, { nullable: true }) resolved?: boolean,
    @Arg('result', () => String, { nullable: true }) result?: string
  ): Promise<PicksType[]> {
    const where: Prisma.PicksWhereInput = {};

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (resolved !== undefined && resolved !== null) {
      where.resolved = resolved;
    }
    if (result) {
      where.result = result as Prisma.EnumSettlementResultFilter;
    }

    const rows = await prisma.picks.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        picks: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      totalPredictorCollateral: r.totalPredictorCollateral,
      totalCounterpartyCollateral: r.totalCounterpartyCollateral,
      claimedPredictorCollateral: r.claimedPredictorCollateral,
      claimedCounterpartyCollateral: r.claimedCounterpartyCollateral,
      resolved: r.resolved,
      result: r.result,
      resolvedAt: r.resolvedAt ?? null,
      predictorToken: r.predictorToken ?? null,
      counterpartyToken: r.counterpartyToken ?? null,
      endsAt: r.endsAt ?? null,
      picks: r.picks.map((p) => ({
        id: p.id,
        pickConfigId: p.pickConfigId,
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
    }));
  }

  @Query(() => PicksType, { nullable: true })
  async pickConfiguration(
    @Arg('id', () => String) id: string
  ): Promise<PicksType | null> {
    const idLower = id.toLowerCase();

    const r = await prisma.picks.findUnique({
      where: { id: idLower },
      include: {
        picks: true,
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      totalPredictorCollateral: r.totalPredictorCollateral,
      totalCounterpartyCollateral: r.totalCounterpartyCollateral,
      claimedPredictorCollateral: r.claimedPredictorCollateral,
      claimedCounterpartyCollateral: r.claimedCounterpartyCollateral,
      resolved: r.resolved,
      result: r.result,
      resolvedAt: r.resolvedAt ?? null,
      predictorToken: r.predictorToken ?? null,
      counterpartyToken: r.counterpartyToken ?? null,
      endsAt: r.endsAt ?? null,
      picks: r.picks.map((p) => ({
        id: p.id,
        pickConfigId: p.pickConfigId,
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Positions (token balances)
  // -------------------------------------------------------------------------

  @Query(() => [PositionType])
  async positions(
    @Arg('holder', () => String) holder: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('pickConfigId', () => String, { nullable: true }) pickConfigId?: string
  ): Promise<PositionType[]> {
    const holderLower = holder.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.PositionWhereInput = {
      holder: holderLower,
    };

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (pickConfigIdLower) {
      where.pickConfigId = pickConfigIdLower;
    }

    const rows = await prisma.position.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
      include: {
        pickConfiguration: {
          include: {
            picks: true,
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      tokenAddress: r.tokenAddress,
      pickConfigId: r.pickConfigId,
      isPredictorToken: r.isPredictorToken,
      holder: r.holder,
      balance: r.balance,
      pickConfig: r.pickConfiguration
        ? {
            id: r.pickConfiguration.id,
            chainId: r.pickConfiguration.chainId,
            marketAddress: r.pickConfiguration.marketAddress,
            totalPredictorCollateral:
              r.pickConfiguration.totalPredictorCollateral,
            totalCounterpartyCollateral:
              r.pickConfiguration.totalCounterpartyCollateral,
            claimedPredictorCollateral:
              r.pickConfiguration.claimedPredictorCollateral,
            claimedCounterpartyCollateral:
              r.pickConfiguration.claimedCounterpartyCollateral,
            resolved: r.pickConfiguration.resolved,
            result: r.pickConfiguration.result,
            resolvedAt: r.pickConfiguration.resolvedAt ?? null,
            predictorToken: r.pickConfiguration.predictorToken ?? null,
            counterpartyToken: r.pickConfiguration.counterpartyToken ?? null,
            endsAt: r.pickConfiguration.endsAt ?? null,
            picks: r.pickConfiguration.picks.map((p) => ({
              id: p.id,
              pickConfigId: p.pickConfigId,
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome,
            })),
          }
        : null,
    }));
  }

  // -------------------------------------------------------------------------
  // Closes (burn records)
  // -------------------------------------------------------------------------

  @Query(() => [CloseType])
  async closes(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('pickConfigId', () => String, { nullable: true })
    pickConfigId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<CloseType[]> {
    const addr = address?.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.CloseWhereInput = {};

    if (addr) {
      where.OR = [{ predictorHolder: addr }, { counterpartyHolder: addr }];
    }
    if (pickConfigIdLower) {
      where.pickConfigId = pickConfigIdLower;
    }
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }

    // Require at least one filter
    if (!addr && !pickConfigIdLower) {
      return [];
    }

    const rows = await prisma.close.findMany({
      where,
      orderBy: { burnedAt: 'desc' },
      take,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      pickConfigId: r.pickConfigId,
      predictorHolder: r.predictorHolder,
      counterpartyHolder: r.counterpartyHolder,
      predictorTokensBurned: r.predictorTokensBurned,
      counterpartyTokensBurned: r.counterpartyTokensBurned,
      predictorPayout: r.predictorPayout,
      counterpartyPayout: r.counterpartyPayout,
      burnedAt: r.burnedAt,
      txHash: r.txHash,
      refCode: r.refCode ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Claims (redemption records)
  // -------------------------------------------------------------------------

  @Query(() => [ClaimType])
  async claims(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('holder', () => String, { nullable: true }) holder?: string,
    @Arg('predictionId', () => String, { nullable: true })
    predictionId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<ClaimType[]> {
    const holderLower = holder?.toLowerCase();
    const predictionIdLower = predictionId?.toLowerCase();

    const where: Prisma.ClaimWhereInput = {};

    if (holderLower) {
      where.holder = holderLower;
    }
    if (predictionIdLower) {
      where.predictionId = predictionIdLower;
    }
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }

    // Require at least one filter
    if (!holderLower && !predictionIdLower) {
      return [];
    }

    const rows = await prisma.claim.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      take,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictionId: r.predictionId,
      holder: r.holder,
      positionToken: r.positionToken,
      tokensBurned: r.tokensBurned,
      collateralPaid: r.collateralPaid,
      redeemedAt: r.redeemedAt,
      txHash: r.txHash,
      refCode: r.refCode ?? null,
    }));
  }
}
