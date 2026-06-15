/**
 * Shared adapter: v2 `Position` node → the app-side `PositionBalance` shape
 * (usePositions). The v1→v2 renames live here in one place:
 *
 * - `tokenAddress`     := `token`
 * - `isPredictorToken` := `side === 'PREDICTOR'`
 * - `realizedPnL`      := `realizedPnl` (case-only rename)
 * - `status`           := v2's explicit `OPEN`/`SOLD` discriminator. v1 encoded
 *   SOLD rows implicitly in the id shape (`<rowId>-sell-<tradeHash>`); v2 makes
 *   it explicit, so consumers stop parsing the opaque Relay id.
 * - `pickConfig`       := `toPickConfigData(node.pickConfig)` (shared mapper)
 *
 * BigInt scalars can arrive as string or number over the wire; normalized to
 * decimal strings so consumers can `BigInt()` them (v1 returned strings).
 */
import {
  PICK_CONFIGURATION_V2_FIELDS,
  toPickConfigData,
  type PickConfigurationV2Node,
} from '~/lib/adapters/pickConfig';
import type { PositionBalance } from '~/hooks/graphql/usePositions';

/** v2 wire shape of a `Position` node (BigInt scalars may arrive as numbers). */
export type PositionV2Node = {
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
  pickConfig?: PickConfigurationV2Node | null;
};

/**
 * Selection set for a v2 `Position` node, matching {@link PositionV2Node}.
 * Interpolate inside a connection's `edges { node { ... } }` selection.
 */
export const POSITION_V2_FIELDS = `
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
    ${PICK_CONFIGURATION_V2_FIELDS}
  }
`;

// The BigInt scalar serializes as string or number depending on the transport;
// normalize present values to decimal strings, keep nulls null (v1 parity).
const wei = (value: string | number | null | undefined): string | null =>
  value == null ? null : String(value);

/** Pure mapper: v2 `Position` node → app `PositionBalance`. */
export function toPositionBalance(node: PositionV2Node): PositionBalance {
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
    pickConfig: node.pickConfig ? toPickConfigData(node.pickConfig) : null,
  };
}
