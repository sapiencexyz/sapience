import {
  Arg,
  Field,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from 'type-graphql';
import { Prisma } from '../../../generated/prisma';
import { SortOrder } from '@generated/type-graphql';
import prisma from '../../db';

// ============================================================================
// Helpers
// ============================================================================

/** Prisma shape of a Picks row with its Pick[] children included. */
type PicksWithPicks = {
  id: string;
  chainId: number;
  marketAddress: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: string;
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  picks: {
    id: number;
    pickConfigId: string;
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }[];
};

/** Map a Prisma Picks (with picks included) to the GraphQL PickConfigurationType shape. */
export function mapPickConfig(
  pc: PicksWithPicks,
  extra?: { predictionId?: string | null }
): PickConfigurationType {
  return {
    id: pc.id,
    chainId: pc.chainId,
    marketAddress: pc.marketAddress,
    totalPredictorCollateral: pc.totalPredictorCollateral,
    totalCounterpartyCollateral: pc.totalCounterpartyCollateral,
    claimedPredictorCollateral: pc.claimedPredictorCollateral,
    claimedCounterpartyCollateral: pc.claimedCounterpartyCollateral,
    resolved: pc.resolved,
    result: pc.result,
    resolvedAt: pc.resolvedAt ?? null,
    predictorToken: pc.predictorToken ?? null,
    counterpartyToken: pc.counterpartyToken ?? null,
    endsAt: pc.endsAt ?? null,
    isLegacy: pc.isLegacy,
    picks: pc.picks.map((p) => ({
      id: p.id,
      pickConfigId: p.pickConfigId,
      conditionResolver: p.conditionResolver,
      conditionId: p.conditionId,
      predictedOutcome: p.predictedOutcome,
    })),
    ...extra,
  };
}

// ============================================================================
// Enums
// ============================================================================

/** Settlement result for a prediction or pick configuration. */
export enum SettlementResult {
  UNRESOLVED = 'UNRESOLVED',
  PREDICTOR_WINS = 'PREDICTOR_WINS',
  COUNTERPARTY_WINS = 'COUNTERPARTY_WINS',
  NON_DECISIVE = 'NON_DECISIVE',
}

registerEnumType(SettlementResult, {
  name: 'SettlementResult',
  description: 'Outcome of a prediction settlement',
});

/** Fields available for sorting predictions. */
export enum PredictionSortField {
  CREATED_AT = 'createdAt',
  SETTLED_AT = 'settledAt',
}

registerEnumType(PredictionSortField, {
  name: 'PredictionSortField',
  description: 'Field to sort predictions by',
});

/** Fields available for sorting positions. */
export enum PositionSortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

registerEnumType(PositionSortField, {
  name: 'PositionSortField',
  description: 'Field to sort positions by',
});

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType('Pick', {
  description: 'Individual outcome pick within a pick configuration',
})
export class PickType {
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

@ObjectType('PickConfiguration', {
  description:
    'Group of outcome picks forming a combined prediction position, with collateral and settlement tracking',
})
export class PickConfigurationType {
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

  @Field(() => SettlementResult)
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

  @Field(() => String, { nullable: true })
  predictionId?: string | null;

  @Field(() => Boolean)
  isLegacy!: boolean;
}

@ObjectType('Prediction', {
  description:
    'Escrow-based prediction record between a predictor and counterparty, with collateral and settlement tracking',
})
export class PredictionType {
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

  @Field(() => SettlementResult)
  result!: string;

  @Field(() => String, { nullable: true })
  predictorClaimable?: string | null;

  @Field(() => String, { nullable: true })
  counterpartyClaimable?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String)
  createTxHash!: string;

  @Field(() => String, { nullable: true })
  settleTxHash?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => Boolean)
  isLegacy!: boolean;

  @Field(() => PickConfigurationType, { nullable: true })
  pickConfig?: PickConfigurationType | null;
}

@ObjectType('Position', {
  description:
    'ERC-20 token balance representing a side of a prediction position',
})
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

  @Field(() => String, { nullable: true })
  userCollateral?: string | null;

  @Field(() => String, { nullable: true })
  totalPayout?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => PickConfigurationType, { nullable: true })
  pickConfig?: PickConfigurationType | null;
}

@ObjectType('Close', {
  description:
    'Record of a position close where both sides burn tokens and receive payouts',
})
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

@ObjectType('Claim', {
  description:
    'Record of a settled prediction redemption where a holder burns tokens for collateral',
})
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
export class EscrowResolver {
  // -------------------------------------------------------------------------
  // Predictions (escrow-based)
  // -------------------------------------------------------------------------

  @Query(() => Int, {
    description: 'Count of escrow predictions involving the given address',
  })
  async predictionCount(
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

  @Query(() => [PredictionType], {
    description:
      'Paginated list of escrow-based predictions, filterable by address, condition, chain, and settlement status',
  })
  async predictions(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('conditionId', () => String, { nullable: true }) conditionId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('settled', () => Boolean, { nullable: true }) settled?: boolean,
    @Arg('isLegacy', () => Boolean, { nullable: true }) isLegacy?: boolean,
    @Arg('orderBy', () => PredictionSortField, { nullable: true })
    orderBy?: PredictionSortField,
    @Arg('orderDirection', () => SortOrder, { nullable: true })
    orderDirection?: SortOrder
  ): Promise<PredictionType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
    const addr = address?.toLowerCase();

    const where: Prisma.PredictionWhereInput = {};
    const filters: Prisma.PredictionWhereInput[] = [];

    if (addr) {
      filters.push({ OR: [{ predictor: addr }, { counterparty: addr }] });
    }

    if (conditionId) {
      const matchingPicks = await prisma.pick.findMany({
        where: {
          conditionId: {
            equals: conditionId.toLowerCase(),
            mode: 'insensitive',
          },
        },
        select: { pickConfigId: true },
        distinct: ['pickConfigId'],
      });
      const pickConfigIds = matchingPicks.map((p) => p.pickConfigId);
      if (pickConfigIds.length === 0) return [];

      filters.push({ pickConfigId: { in: pickConfigIds } });
    }

    if (chainId !== undefined && chainId !== null) {
      filters.push({ chainId });
    }
    if (settled !== undefined && settled !== null) {
      filters.push({ settled });
    }
    if (isLegacy !== undefined && isLegacy !== null) {
      filters.push({ isLegacy });
    }

    if (filters.length > 0) {
      where.AND = filters;
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
      take: cappedTake,
      skip,
      include: {
        pickConfiguration: {
          include: { picks: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorToken: r.pickConfiguration?.predictorToken ?? '',
      counterpartyToken: r.pickConfiguration?.counterpartyToken ?? '',
      predictorCollateral: r.predictorCollateral,
      counterpartyCollateral: r.counterpartyCollateral,
      collateralDeposited: r.collateralDeposited ?? null,
      collateralDepositedAt: r.collateralDepositedAt ?? null,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      result: r.result,
      predictorClaimable: r.predictorClaimable ?? null,
      counterpartyClaimable: r.counterpartyClaimable ?? null,
      createdAt: r.createdAt,
      createTxHash: r.createTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
      isLegacy: r.isLegacy,
      pickConfig: r.pickConfiguration
        ? mapPickConfig(r.pickConfiguration)
        : null,
    }));
  }

  @Query(() => PredictionType, {
    nullable: true,
    description: 'Look up a single prediction by its on-chain prediction ID',
  })
  async prediction(
    @Arg('id', () => String) id: string
  ): Promise<PredictionType | null> {
    const predictionIdLower = id.toLowerCase();

    const r = await prisma.prediction.findUnique({
      where: { predictionId: predictionIdLower },
      include: {
        pickConfiguration: {
          include: { picks: true },
        },
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      predictionId: r.predictionId,
      chainId: r.chainId,
      marketAddress: r.marketAddress,
      predictor: r.predictor,
      counterparty: r.counterparty,
      predictorToken: r.pickConfiguration?.predictorToken ?? '',
      counterpartyToken: r.pickConfiguration?.counterpartyToken ?? '',
      predictorCollateral: r.predictorCollateral,
      counterpartyCollateral: r.counterpartyCollateral,
      collateralDeposited: r.collateralDeposited ?? null,
      collateralDepositedAt: r.collateralDepositedAt ?? null,
      settled: r.settled,
      settledAt: r.settledAt ?? null,
      result: r.result,
      predictorClaimable: r.predictorClaimable ?? null,
      counterpartyClaimable: r.counterpartyClaimable ?? null,
      createdAt: r.createdAt,
      createTxHash: r.createTxHash,
      settleTxHash: r.settleTxHash ?? null,
      refCode: r.refCode ?? null,
      isLegacy: r.isLegacy,
      pickConfig: r.pickConfiguration
        ? mapPickConfig(r.pickConfiguration)
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // Pick Configurations
  // -------------------------------------------------------------------------

  @Query(() => [PickConfigurationType], {
    description:
      'Paginated list of pick configurations, filterable by chain, resolution status, and result',
  })
  async pickConfigurations(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('resolved', () => Boolean, { nullable: true }) resolved?: boolean,
    @Arg('result', () => SettlementResult, { nullable: true })
    result?: SettlementResult,
    @Arg('tokens', () => [String], { nullable: true })
    tokens?: string[]
  ): Promise<PickConfigurationType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
    const where: Prisma.PicksWhereInput = {};

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (resolved !== undefined && resolved !== null) {
      where.resolved = resolved;
    }
    if (result) {
      where.result = result as unknown as Prisma.EnumSettlementResultFilter;
    }
    if (tokens && tokens.length > 0) {
      if (tokens.length > 100) {
        throw new Error('tokens filter limited to 100 addresses');
      }
      const lowered = tokens.map((t) => t.toLowerCase());
      where.OR = [
        { predictorToken: { in: lowered } },
        { counterpartyToken: { in: lowered } },
      ];
    }

    const rows = await prisma.picks.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedTake,
      skip,
      include: {
        picks: true,
      },
    });

    return rows.map((r) => mapPickConfig(r));
  }

  @Query(() => PickConfigurationType, {
    nullable: true,
    description: 'Look up a single pick configuration by ID',
  })
  async pickConfiguration(
    @Arg('id', () => String) id: string
  ): Promise<PickConfigurationType | null> {
    const idLower = id.toLowerCase();

    const r = await prisma.picks.findUnique({
      where: { id: idLower },
      include: {
        picks: true,
      },
    });

    if (!r) return null;

    return mapPickConfig(r);
  }

  // -------------------------------------------------------------------------
  // Positions (token balances)
  // -------------------------------------------------------------------------

  @Query(() => [PositionType], {
    description:
      'Paginated list of token position balances, filterable by holder, condition, chain, pick config, settlement, date range, collateral range, and won/lost status',
  })
  async positions(
    @Arg('holder', () => String, { nullable: true }) holder?: string,
    @Arg('conditionId', () => String, { nullable: true }) conditionId?: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number = 50,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number = 0,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('pickConfigId', () => String, { nullable: true })
    pickConfigId?: string,
    @Arg('settled', () => Boolean, { nullable: true }) settled?: boolean,
    @Arg('result', () => SettlementResult, { nullable: true })
    result?: SettlementResult,
    @Arg('endsAtMin', () => Int, { nullable: true }) endsAtMin?: number,
    @Arg('endsAtMax', () => Int, { nullable: true }) endsAtMax?: number,
    @Arg('holderWon', () => Boolean, { nullable: true }) holderWon?: boolean,
    @Arg('collateralMin', () => String, { nullable: true })
    collateralMin?: string,
    @Arg('collateralMax', () => String, { nullable: true })
    collateralMax?: string,
    @Arg('orderBy', () => PositionSortField, { nullable: true })
    orderBy?: PositionSortField,
    @Arg('orderDirection', () => SortOrder, { nullable: true })
    orderDirection?: SortOrder
  ): Promise<PositionType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
    const holderLower = holder?.toLowerCase();
    const pickConfigIdLower = pickConfigId?.toLowerCase();

    const where: Prisma.PositionWhereInput = {};

    if (holderLower) {
      where.holder = holderLower;
    }

    if (conditionId) {
      const matchingPicks = await prisma.pick.findMany({
        where: {
          conditionId: {
            equals: conditionId.toLowerCase(),
            mode: 'insensitive',
          },
        },
        select: { pickConfigId: true },
        distinct: ['pickConfigId'],
      });
      const pickConfigIds = matchingPicks.map((p) => p.pickConfigId);
      if (pickConfigIds.length === 0) return [];
      where.pickConfigId = { in: pickConfigIds };
    }

    // Require at least one filter
    if (!holderLower && !conditionId && !pickConfigIdLower) {
      return [];
    }

    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    if (pickConfigIdLower && !conditionId) {
      where.pickConfigId = pickConfigIdLower;
    }
    if (settled !== undefined && settled !== null) {
      where.pickConfiguration = {
        ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
        resolved: settled,
      };
    }
    if (result) {
      where.pickConfiguration = {
        ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
        result: result as unknown as Prisma.EnumSettlementResultFilter,
      };
    }

    // Date range filter on pickConfiguration.endsAt
    if (endsAtMin !== undefined || endsAtMax !== undefined) {
      const endsAtFilter: Record<string, number> = {};
      if (endsAtMin !== undefined) endsAtFilter.gte = endsAtMin;
      if (endsAtMax !== undefined) endsAtFilter.lte = endsAtMax;
      where.pickConfiguration = {
        ...((where.pickConfiguration as Prisma.PicksWhereInput) ?? {}),
        endsAt: endsAtFilter,
      };
    }

    // Won/lost filter: combines position side (isPredictorToken) with settlement result.
    // Extract pickConfiguration conditions built above so they apply consistently
    // inside each OR branch without relying on spread-and-overwrite ordering.
    if (holderWon !== undefined && holderWon !== null) {
      const basePc = (where.pickConfiguration as Prisma.PicksWhereInput) ?? {};
      // Remove top-level pickConfiguration; it will live inside the OR branches
      delete where.pickConfiguration;

      const [winResult, loseResult] = holderWon
        ? ['PREDICTOR_WINS', 'COUNTERPARTY_WINS']
        : ['COUNTERPARTY_WINS', 'PREDICTOR_WINS'];

      where.OR = [
        {
          isPredictorToken: true,
          pickConfiguration: {
            ...basePc,
            result: winResult as unknown as Prisma.EnumSettlementResultFilter,
          },
        },
        {
          isPredictorToken: false,
          pickConfiguration: {
            ...basePc,
            result: loseResult as unknown as Prisma.EnumSettlementResultFilter,
          },
        },
      ];
    }

    // Collateral range filter: pre-query pickConfigIds where holder's collateral is in range
    if (holderLower && (collateralMin || collateralMax)) {
      const minVal = collateralMin ? BigInt(collateralMin) : 0n;
      const maxVal = collateralMax ? BigInt(collateralMax) : null;

      interface PickConfigRow {
        pickConfigId: string;
        is_predictor: boolean;
      }
      const matchingConfigs = await prisma.$queryRaw<PickConfigRow[]>`
        SELECT "pickConfigId", true AS is_predictor
        FROM "Prediction"
        WHERE predictor = ${holderLower} AND "pickConfigId" IS NOT NULL
        GROUP BY "pickConfigId"
        HAVING SUM(CAST("predictorCollateral" AS DECIMAL)) >= ${minVal.toString()}::DECIMAL
          ${maxVal !== null ? Prisma.sql`AND SUM(CAST("predictorCollateral" AS DECIMAL)) <= ${maxVal.toString()}::DECIMAL` : Prisma.empty}
        UNION
        SELECT "pickConfigId", false AS is_predictor
        FROM "Prediction"
        WHERE counterparty = ${holderLower} AND "pickConfigId" IS NOT NULL
        GROUP BY "pickConfigId"
        HAVING SUM(CAST("counterpartyCollateral" AS DECIMAL)) >= ${minVal.toString()}::DECIMAL
          ${maxVal !== null ? Prisma.sql`AND SUM(CAST("counterpartyCollateral" AS DECIMAL)) <= ${maxVal.toString()}::DECIMAL` : Prisma.empty}
      `;

      if (matchingConfigs.length === 0) return [];

      const validPickConfigIds = matchingConfigs.map((r) => r.pickConfigId);

      // Intersect with existing pickConfigId filter if present
      if (
        where.pickConfigId &&
        typeof where.pickConfigId === 'object' &&
        'in' in where.pickConfigId
      ) {
        const existing = where.pickConfigId.in as string[];
        where.pickConfigId = {
          in: existing.filter((id) => validPickConfigIds.includes(id)),
        };
      } else if (where.pickConfigId && typeof where.pickConfigId === 'string') {
        if (!validPickConfigIds.includes(where.pickConfigId)) return [];
      } else {
        where.pickConfigId = { in: validPickConfigIds };
      }
    }

    // Hide zero-balance positions that are not yet settled (no resolution).
    // These are positions where the user burned/transferred tokens before
    // settlement — they show "0.00 USDe" with "PENDING" PnL.
    // Keep zero-balance positions that ARE settled (post-burn with PnL data).
    where.NOT = {
      balance: '0',
      pickConfiguration: {
        resolved: false,
      },
    };

    const direction = orderDirection === 'asc' ? 'asc' : 'desc';
    const orderByClause: Prisma.PositionOrderByWithRelationInput = {
      [orderBy ?? 'updatedAt']: direction,
    };

    const rows = await prisma.position.findMany({
      where,
      orderBy: orderByClause,
      take: cappedTake,
      skip,
      include: {
        pickConfiguration: {
          include: {
            picks: true,
            predictions: true,
          },
        },
      },
    });

    return rows.map((r) => {
      const pc = r.pickConfiguration;

      // Compute collateral from predictions included via pickConfiguration
      let userCollateral = 0n;
      let totalPayout = 0n;
      let predictionId: string | null = null;

      if (pc) {
        for (const pred of pc.predictions) {
          const predCollateral = BigInt(pred.predictorCollateral);
          const cpCollateral = BigInt(pred.counterpartyCollateral);
          const predictionTotal = predCollateral + cpCollateral;

          if (r.isPredictorToken && pred.predictor === r.holder) {
            predictionId = pred.predictionId;
            userCollateral += predCollateral;
            totalPayout += predictionTotal;
          } else if (!r.isPredictorToken && pred.counterparty === r.holder) {
            predictionId = pred.predictionId;
            userCollateral += cpCollateral;
            totalPayout += predictionTotal;
          }
        }
      }

      return {
        id: r.id,
        chainId: r.chainId,
        tokenAddress: r.tokenAddress,
        pickConfigId: r.pickConfigId,
        isPredictorToken: r.isPredictorToken,
        holder: r.holder,
        balance: r.balance,
        userCollateral: userCollateral > 0n ? userCollateral.toString() : null,
        totalPayout: totalPayout > 0n ? totalPayout.toString() : null,
        createdAt: r.createdAt,
        pickConfig: pc ? mapPickConfig(pc, { predictionId }) : null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Closes (burn records)
  // -------------------------------------------------------------------------

  @Query(() => [CloseType], {
    description:
      'Paginated list of position close (burn) records, filterable by address, pick config, and chain',
  })
  async closes(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('pickConfigId', () => String, { nullable: true })
    pickConfigId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<CloseType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
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
      take: cappedTake,
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

  @Query(() => [ClaimType], {
    description:
      'Paginated list of prediction claim (redemption) records, filterable by holder, prediction, and chain',
  })
  async claims(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('holder', () => String, { nullable: true }) holder?: string,
    @Arg('predictionId', () => String, { nullable: true })
    predictionId?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<ClaimType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
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
      take: cappedTake,
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
