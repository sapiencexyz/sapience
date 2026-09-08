/**
 * Shared adapter: GraphQL `Position` node → the app-side `PositionBalance` shape
 * (usePositions). The wire-to-app renames live here in one place:
 *
 * - `tokenAddress`     := `token`
 * - `isPredictorToken` := `side === 'PREDICTOR'`
 * - `realizedPnL`      := `realizedPnl` (case-only rename)
 * - `status`           := the explicit `OPEN`/`SOLD` discriminator. The id shape
 *   previously encoded SOLD rows implicitly (`<rowId>-sell-<tradeHash>`); the schema
 *   now makes it explicit, so consumers stop parsing the opaque Relay id.
 * - `pickConfig`       := `toPickConfigData(node.pickConfig)` (shared mapper),
 *   with `predictionId` backfilled from `node.prediction` — the schema no longer
 *   exposes a `pickConfig.predictionId` field, but claim/redeem (`handleClaim`) and the
 *   prediction permalink still read it, so the holder's prediction id is
 *   surfaced via `Position.prediction` and grafted back on.
 *
 * BigInt scalars can arrive as string or number over the wire; normalized to
 * decimal strings so consumers can `BigInt()` them (the field previously returned strings).
 */
import {
  PICK_CONFIGURATION_FIELDS,
  toPickConfigData,
  type PickConfigurationNode,
} from '~/lib/adapters/pickConfig';
import type { PositionBalance } from '~/hooks/graphql/usePositions';

/** GraphQL wire shape of a `Position` node (BigInt scalars may arrive as numbers). */
export type PositionNode = {
  id: string;
  chainId: number;
  holder: string;
  pickConfigId: string;
  token: string;
  side: 'PREDICTOR' | 'COUNTERPARTY';
  status: 'OPEN' | 'SOLD';
  balance: string | number;
  userCollateral?: string | number | null;
  totalPayout?: string | number | null;
  realizedPnl?: string | number | null;
  createdAt: string;
  updatedAt: string;
  pickConfig?: PickConfigurationNode | null;
  // The holder's prediction for this pickConfig — the schema's home for the id that
  // previously lived on `pickConfig.predictionId` (claim/redeem + permalink read it).
  prediction?: { predictionId: string } | null;
};

/**
 * Selection set for a GraphQL `Position` node, matching {@link PositionNode}.
 * Interpolate inside a connection's `edges { node { ... } }` selection.
 */
export const POSITION_FIELDS = `
  id
  chainId
  holder
  pickConfigId
  token
  side
  status
  balance
  userCollateral
  totalPayout
  realizedPnl
  createdAt
  updatedAt
  pickConfig {
    ${PICK_CONFIGURATION_FIELDS}
  }
  prediction {
    predictionId
  }
`;

// The BigInt scalar serializes as string or number depending on the transport;
// normalize present values to decimal strings, keep nulls null.
const wei = (value: string | number | null | undefined): string | null =>
  value == null ? null : String(value);

/** Pure mapper: GraphQL `Position` node → app `PositionBalance`. */
export function toPositionBalance(node: PositionNode): PositionBalance {
  return {
    id: node.id,
    chainId: node.chainId,
    tokenAddress: node.token,
    pickConfigId: node.pickConfigId,
    isPredictorToken: node.side === 'PREDICTOR',
    holder: node.holder,
    balance: String(node.balance ?? '0'),
    userCollateral: wei(node.userCollateral),
    totalPayout: wei(node.totalPayout),
    realizedPnL: wei(node.realizedPnl),
    status: node.status,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    pickConfig: node.pickConfig
      ? {
          ...toPickConfigData(node.pickConfig),
          // The schema no longer exposes pickConfig.predictionId; graft it back from
          // the holder's prediction so claim/redeem + permalinks keep working.
          predictionId: node.prediction?.predictionId ?? null,
        }
      : null,
  };
}
