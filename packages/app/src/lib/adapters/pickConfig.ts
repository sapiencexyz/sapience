/**
 * Shared adapter: v2 `PickConfiguration` node → the existing app-side
 * `PickConfigData` shape (usePositions). Every v2 consumer that embeds a
 * pick configuration (trades, activity, predictions, positions) maps the
 * wire node through `toPickConfigData` so the semantic v1→v2 renames live
 * in exactly one place:
 *
 * - `id`            := `pickConfigId` (deterministic 0x-hash, v2 drops row ids)
 * - `marketAddress` := `escrow`
 * - `result`        := `result ?? 'UNRESOLVED'` (v2 result is nullable)
 * - picks: `conditionResolver` := `resolver`,
 *          `predictedOutcome`  := `'YES' → 1`, otherwise `0`,
 *          `condition.id`      := `conditionId` (the CTF hash — field name
 *          stays `id` so app hash-matching sites keep working)
 * - pick `id` is re-keyed to the stable string `${pickConfigId}:${conditionId}`
 *   (v1's numeric Prisma row id is gone in v2; we never invent fake numbers)
 */
import type {
  PickConditionData,
  PickConfigData,
  PickData,
} from '~/hooks/graphql/usePositions';

/** v2 wire shape of an embedded pick condition (CTF hash + metadata). */
export type PickConditionV2Node = {
  conditionId: string;
  shortName?: string | null;
  optionName?: string | null;
  question?: string | null;
  description?: string | null;
  endTime?: number | null;
  resolver?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  estimatedPrice?: number | null;
  category?: { slug?: string | null } | null;
};

/** v2 wire shape of a pick (no row id; `resolver` instead of `conditionResolver`). */
export type PickV2Node = {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition?: PickConditionV2Node | null;
};

/** v2 wire shape of a PickConfiguration node. */
export type PickConfigurationV2Node = {
  pickConfigId: string;
  chainId: number;
  escrow: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE' | null;
  resolvedAt?: number | null;
  predictorToken?: string | null;
  counterpartyToken?: string | null;
  endsAt?: number | null;
  isLegacy: boolean;
  picks?: PickV2Node[] | null;
};

/**
 * `PickData` with the numeric row id re-keyed to a stable string.
 * Collapses into `PickData` once usePositions drops its numeric pick id.
 */
export type AdaptedPickData = Omit<PickData, 'id'> & { id: string };

/** `PickConfigData` whose picks carry string ids (see {@link AdaptedPickData}). */
export type AdaptedPickConfigData = Omit<PickConfigData, 'picks'> & {
  picks: AdaptedPickData[];
};

/**
 * Selection set for a v2 `PickConfiguration` node, matching
 * {@link PickConfigurationV2Node}. Interpolate inside a `nodes { ... }`
 * (or single-object) selection.
 */
export const PICK_CONFIGURATION_V2_FIELDS = `
  pickConfigId
  chainId
  escrow
  totalPredictorCollateral
  totalCounterpartyCollateral
  claimedPredictorCollateral
  claimedCounterpartyCollateral
  resolved
  result
  resolvedAt
  predictorToken
  counterpartyToken
  endsAt
  isLegacy
  picks {
    conditionId
    resolver
    predictedOutcome
    condition {
      conditionId
      shortName
      optionName
      question
      description
      endTime
      resolver
      settled
      resolvedToYes
      nonDecisive
      estimatedPrice
      category {
        slug
      }
    }
  }
`;

function toPickConditionData(
  condition: PickConditionV2Node | null | undefined
): PickConditionData | null {
  if (!condition) return null;
  return {
    id: condition.conditionId,
    shortName: condition.shortName ?? null,
    optionName: condition.optionName ?? null,
    question: condition.question ?? null,
    description: condition.description ?? null,
    endTime: condition.endTime ?? null,
    resolver: condition.resolver ?? null,
    category: condition.category ?? null,
    settled: condition.settled,
    resolvedToYes: condition.resolvedToYes,
    nonDecisive: condition.nonDecisive,
    estimatedPrice: condition.estimatedPrice ?? null,
  };
}

function toAdaptedPick(
  pickConfigId: string,
  pick: PickV2Node
): AdaptedPickData {
  return {
    id: `${pickConfigId}:${pick.conditionId}`,
    pickConfigId,
    conditionResolver: pick.resolver,
    conditionId: pick.conditionId,
    predictedOutcome: pick.predictedOutcome === 'YES' ? 1 : 0,
    condition: toPickConditionData(pick.condition),
  };
}

/**
 * Pure mapper: v2 `PickConfiguration` node → `PickConfigData`. BigInt
 * scalar fields are normalized via `String()` so collateral values are
 * always strings regardless of how the BigInt scalar serialized.
 */
export function toPickConfigData(
  node: PickConfigurationV2Node
): AdaptedPickConfigData {
  return {
    id: node.pickConfigId,
    chainId: node.chainId,
    marketAddress: node.escrow,
    totalPredictorCollateral: String(node.totalPredictorCollateral),
    totalCounterpartyCollateral: String(node.totalCounterpartyCollateral),
    claimedPredictorCollateral: String(node.claimedPredictorCollateral),
    claimedCounterpartyCollateral: String(node.claimedCounterpartyCollateral),
    resolved: node.resolved,
    result: node.result ?? 'UNRESOLVED',
    resolvedAt: node.resolvedAt ?? null,
    predictorToken: node.predictorToken ?? null,
    counterpartyToken: node.counterpartyToken ?? null,
    endsAt: node.endsAt ?? null,
    isLegacy: node.isLegacy,
    picks: (node.picks ?? []).map((pick) =>
      toAdaptedPick(node.pickConfigId, pick)
    ),
  };
}
