import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Prisma } from '../../../generated/prisma';
import prisma from '../../db';

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType()
class V2PickType {
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
class V2PickConfigurationType {
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

  @Field(() => [V2PickType])
  picks!: V2PickType[];

  @Field(() => Int)
  predictionsCount!: number;
}

@ObjectType()
class V2PredictionType {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  predictionId!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => String)
  predictor!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  predictorWager!: string;

  @Field(() => String)
  counterpartyWager!: string;

  @Field(() => String)
  predictorTokensMinted!: string;

  @Field(() => String)
  counterpartyTokensMinted!: string;

  @Field(() => String)
  predictorNonce!: string;

  @Field(() => String)
  counterpartyNonce!: string;

  @Field(() => Boolean)
  settled!: boolean;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => String)
  mintTxHash!: string;

  @Field(() => String, { nullable: true })
  settleTxHash?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => V2PickConfigurationType, { nullable: true })
  pickConfiguration?: V2PickConfigurationType | null;
}

@ObjectType()
class V2PositionBalanceType {
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
}

@ObjectType()
class V2BurnRecordType {
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
  predictorTokenAmount!: string;

  @Field(() => String)
  counterpartyTokenAmount!: string;

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
class V2RedemptionRecordType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => String)
  redeemer!: string;

  @Field(() => String)
  positionToken!: string;

  @Field(() => String)
  tokenAmount!: string;

  @Field(() => String)
  collateralPaid!: string;

  @Field(() => Int)
  redeemedAt!: number;

  @Field(() => String)
  txHash!: string;
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class V2PositionResolver {
  // -------------------------------------------------------------------------
  // V2 Predictions
  // -------------------------------------------------------------------------

  @Query(() => Int)
  async v2PredictionsCount(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const addr = address.toLowerCase();
    const where: Prisma.V2PredictionWhereInput = {
      OR: [{ predictor: addr }, { counterparty: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    return prisma.v2Prediction.count({ where });
  }

  @Query(() => [V2PredictionType])
  async v2Predictions(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('settled', () => Boolean, { nullable: true }) settled?: boolean,
    @Arg('pickConfigId', () => String, { nullable: true }) pickConfigId?: string,
    @Arg('orderBy', () => String, { nullable: true }) orderBy?: string,
    @Arg('orderDirection', () => String, { nullable: true }) orderDirection?: string
  ): Promise<V2PredictionType[]> {
    const addr = address?.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.V2PredictionWhereInput = {};

    if (addr) {
      where.OR = [{ predictor: addr }, { counterparty: addr }];
    }
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (settled !== undefined && settled !== null) {
      where.settled = settled;
    }
    if (pickConfigIdLower) {
      where.pickConfigId = pickConfigIdLower;
    }

    // If no filters provided, return empty
    if (!addr && !pickConfigIdLower) {
      return [];
    }

    let orderByClause: Prisma.V2PredictionOrderByWithRelationInput = {
      mintedAt: 'desc',
    };

    if (orderBy === 'mintedAt') {
      orderByClause = { mintedAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    } else if (orderBy === 'settledAt') {
      orderByClause = { settledAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    }

    const rows = await prisma.v2Prediction.findMany({
      where,
      orderBy: orderByClause,
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
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      pickConfigId: r.pickConfigId,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorWager: r.predictorWager,
      counterpartyWager: r.counterpartyWager,
      predictorTokensMinted: r.predictorTokensMinted,
      counterpartyTokensMinted: r.counterpartyTokensMinted,
      predictorNonce: r.predictorNonce,
      counterpartyNonce: r.counterpartyNonce,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      mintedAt: r.mintedAt,
      mintTxHash: r.mintTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
      pickConfiguration: r.pickConfiguration
        ? {
            id: r.pickConfiguration.id,
            chainId: r.pickConfiguration.chainId,
            marketAddress: r.pickConfiguration.marketAddress,
            totalPredictorCollateral: r.pickConfiguration.totalPredictorCollateral,
            totalCounterpartyCollateral: r.pickConfiguration.totalCounterpartyCollateral,
            claimedPredictorCollateral: r.pickConfiguration.claimedPredictorCollateral,
            claimedCounterpartyCollateral: r.pickConfiguration.claimedCounterpartyCollateral,
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
            predictionsCount: 0, // Will be filled by separate query if needed
          }
        : null,
    }));
  }

  @Query(() => V2PredictionType, { nullable: true })
  async v2Prediction(
    @Arg('predictionId', () => String) predictionId: string
  ): Promise<V2PredictionType | null> {
    const predictionIdLower = predictionId.toLowerCase();

    const r = await prisma.v2Prediction.findUnique({
      where: { predictionId: predictionIdLower },
      include: {
        pickConfiguration: {
          include: {
            picks: true,
            _count: {
              select: { predictions: true },
            },
          },
        },
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      pickConfigId: r.pickConfigId,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorWager: r.predictorWager,
      counterpartyWager: r.counterpartyWager,
      predictorTokensMinted: r.predictorTokensMinted,
      counterpartyTokensMinted: r.counterpartyTokensMinted,
      predictorNonce: r.predictorNonce,
      counterpartyNonce: r.counterpartyNonce,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      mintedAt: r.mintedAt,
      mintTxHash: r.mintTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
      pickConfiguration: r.pickConfiguration
        ? {
            id: r.pickConfiguration.id,
            chainId: r.pickConfiguration.chainId,
            marketAddress: r.pickConfiguration.marketAddress,
            totalPredictorCollateral: r.pickConfiguration.totalPredictorCollateral,
            totalCounterpartyCollateral: r.pickConfiguration.totalCounterpartyCollateral,
            claimedPredictorCollateral: r.pickConfiguration.claimedPredictorCollateral,
            claimedCounterpartyCollateral: r.pickConfiguration.claimedCounterpartyCollateral,
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
            predictionsCount: r.pickConfiguration._count.predictions,
          }
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // V2 Pick Configurations
  // -------------------------------------------------------------------------

  @Query(() => [V2PickConfigurationType])
  async v2PickConfigurations(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('resolved', () => Boolean, { nullable: true }) resolved?: boolean,
    @Arg('result', () => String, { nullable: true }) result?: string
  ): Promise<V2PickConfigurationType[]> {
    const where: Prisma.V2PickConfigurationWhereInput = {};

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (resolved !== undefined && resolved !== null) {
      where.resolved = resolved;
    }
    if (result) {
      where.result = result as Prisma.EnumV2SettlementResultFilter;
    }

    const rows = await prisma.v2PickConfiguration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        picks: true,
        _count: {
          select: { predictions: true },
        },
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
      predictionsCount: r._count.predictions,
    }));
  }

  @Query(() => V2PickConfigurationType, { nullable: true })
  async v2PickConfiguration(
    @Arg('id', () => String) id: string
  ): Promise<V2PickConfigurationType | null> {
    const idLower = id.toLowerCase();

    const r = await prisma.v2PickConfiguration.findUnique({
      where: { id: idLower },
      include: {
        picks: true,
        _count: {
          select: { predictions: true },
        },
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
      predictionsCount: r._count.predictions,
    };
  }

  // -------------------------------------------------------------------------
  // V2 Position Balances
  // -------------------------------------------------------------------------

  @Query(() => [V2PositionBalanceType])
  async v2PositionBalances(
    @Arg('holder', () => String) holder: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('pickConfigId', () => String, { nullable: true }) pickConfigId?: string
  ): Promise<V2PositionBalanceType[]> {
    const holderLower = holder.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.V2PositionBalanceWhereInput = {
      holder: holderLower,
    };

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (pickConfigIdLower) {
      where.pickConfigId = pickConfigIdLower;
    }

    const rows = await prisma.v2PositionBalance.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      tokenAddress: r.tokenAddress,
      pickConfigId: r.pickConfigId,
      isPredictorToken: r.isPredictorToken,
      holder: r.holder,
      balance: r.balance,
    }));
  }

  // -------------------------------------------------------------------------
  // V2 Burn Records
  // -------------------------------------------------------------------------

  @Query(() => [V2BurnRecordType])
  async v2BurnRecords(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('pickConfigId', () => String, { nullable: true }) pickConfigId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<V2BurnRecordType[]> {
    const addr = address?.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.V2BurnRecordWhereInput = {};

    if (addr) {
      where.OR = [
        { predictorHolder: addr },
        { counterpartyHolder: addr },
      ];
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

    const rows = await prisma.v2BurnRecord.findMany({
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
      predictorTokenAmount: r.predictorTokenAmount,
      counterpartyTokenAmount: r.counterpartyTokenAmount,
      predictorPayout: r.predictorPayout,
      counterpartyPayout: r.counterpartyPayout,
      burnedAt: r.burnedAt,
      txHash: r.txHash,
      refCode: r.refCode ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // V2 Redemption Records
  // -------------------------------------------------------------------------

  @Query(() => [V2RedemptionRecordType])
  async v2RedemptionRecords(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('redeemer', () => String, { nullable: true }) redeemer?: string,
    @Arg('pickConfigId', () => String, { nullable: true }) pickConfigId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<V2RedemptionRecordType[]> {
    const redeemerLower = redeemer?.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.V2RedemptionRecordWhereInput = {};

    if (redeemerLower) {
      where.redeemer = redeemerLower;
    }
    if (pickConfigIdLower) {
      where.pickConfigId = pickConfigIdLower;
    }
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }

    // Require at least one filter
    if (!redeemerLower && !pickConfigIdLower) {
      return [];
    }

    const rows = await prisma.v2RedemptionRecord.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      take,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      pickConfigId: r.pickConfigId,
      redeemer: r.redeemer,
      positionToken: r.positionToken,
      tokenAmount: r.tokenAmount,
      collateralPaid: r.collateralPaid,
      redeemedAt: r.redeemedAt,
      txHash: r.txHash,
    }));
  }
}
