/**
 * Shared helper for mapping a Prisma Picks row (with picks included)
 * to the GraphQL PickConfiguration shape. `PickConfiguration` isn't
 * a direct Prisma model projection — the Prisma model is `Picks`
 * (plural) and the SDL deliberately renames it while keeping a slightly
 * different field shape (e.g. `picks` as an inline `Pick[]`).
 *
 * Used by resolvers/queries/activity.ts, resolvers/queries/escrow.ts
 * (Phase 3) and any future code that exposes a picks configuration
 * via GraphQL.
 */

import type {
  PickConfiguration,
  ResolversParentTypes,
} from '../__generated__/resolvers';

/** Resolver-parent shape for `PickConfiguration` — `picks` element's
 *  `condition` resolves to a `PrismaConditionRow` (the value the
 *  Condition resolver expects as parent), not the GraphQL `Condition`
 *  model type. Returning the parent type avoids a Maybe<Condition>
 *  vs Maybe<PrismaConditionRow> conflict that the model type would
 *  cause once Pick has a `condition` field. */
type PickConfigurationParent = ResolversParentTypes['PickConfiguration'];

/** Prisma shape of a Picks row with its Pick[] children included. */
export type PicksWithPicks = {
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

export const mapPickConfig = (
  pc: PicksWithPicks,
  extra?: { predictionId?: string | null }
): PickConfigurationParent => ({
  id: pc.id,
  chainId: pc.chainId,
  marketAddress: pc.marketAddress,
  totalPredictorCollateral: pc.totalPredictorCollateral,
  totalCounterpartyCollateral: pc.totalCounterpartyCollateral,
  claimedPredictorCollateral: pc.claimedPredictorCollateral,
  claimedCounterpartyCollateral: pc.claimedCounterpartyCollateral,
  resolved: pc.resolved,
  // SDL exposes `result` as a `SettlementResult!` enum — codegen types
  // it as the enum union, while Prisma hands us the raw string.
  result: pc.result as PickConfiguration['result'],
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
  predictionId: extra?.predictionId ?? null,
}) as PickConfigurationParent;
