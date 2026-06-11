/**
 * v2 Position — raw `Position` row, optionally carrying the WAC synthesis
 * fields attached by `queries/position.ts` (`positions` connection nodes).
 *
 * Global id encodes the natural key `(chainId, tokenAddress, holder)` —
 * the row's unique balance identity — never the Prisma row id. Synthesized
 * SOLD rows (one per secondary sale, v1 parity) append a `:sell:<tradeHash>`
 * discriminator so the id stays unique; they are projections of a trade
 * onto the balance row and are NOT individually addressable via `node()` /
 * `position(id:)` (the loaders reject the suffixed key).
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { PositionResolvers } from '../__generated__/resolvers';
import type { WacFields } from './queries/position';

/** Parent may be a raw Prisma row or a synthesized connection node. */
const wac = (parent: unknown): Partial<WacFields> =>
  parent as Partial<WacFields>;

registerNodeTypeV2({
  type: 'Position',
  loader: async (id) => {
    const key = id.split(':');
    // Exactly (chainId, tokenAddress, holder) — SOLD-row ids carry a
    // `:sell:<tradeHash>` suffix and must not resolve to the OPEN parent.
    if (key.length !== 3) return null;
    const [chainId, tokenAddress, holder] = key;
    const c = Number(chainId);
    if (!tokenAddress || !holder || !Number.isInteger(c)) return null;
    return prisma.position.findUnique({
      where: {
        chainId_tokenAddress_holder: { chainId: c, tokenAddress, holder },
      },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  },
});

export const Position: PositionResolvers = {
  id: (parent) => {
    const base = `${parent.chainId}:${parent.tokenAddress}:${parent.holder}`;
    const { soldTradeHash } = wac(parent);
    // v1 encoded SOLD rows as `<rowId>-sell-<tradeHash>`; v2 keeps the
    // discriminator inside the opaque natural key.
    return toGlobalIdV2(
      'Position',
      soldTradeHash ? `${base}:sell:${soldTradeHash}` : base
    );
  },
  holder: (parent) => parent.holder.toLowerCase(),
  token: (parent) => parent.tokenAddress.toLowerCase(),
  side: (parent) =>
    (parent.isPredictorToken ? 'PREDICTOR' : 'COUNTERPARTY') as never,
  pickConfig: (parent) => {
    const withConfig = parent as typeof parent & {
      pickConfiguration?: Awaited<
        ReturnType<typeof prisma.picks.findUnique>
      > | null;
    };
    return withConfig.pickConfiguration ?? null;
  },

  // WAC synthesis fields — set on `positions` connection nodes; null on
  // parents that bypassed the synthesis (`position(id:)`, `node()`),
  // matching the SDL's documented nullability.
  userCollateral: (parent) => {
    const v = wac(parent).userCollateral;
    return v == null ? null : BigInt(v);
  },
  totalPayout: (parent) => {
    const v = wac(parent).totalPayout;
    return v == null ? null : BigInt(v);
  },
  realizedPnl: (parent) => {
    const v = wac(parent).realizedPnl;
    return v == null ? null : BigInt(v);
  },
  status: (parent) => (wac(parent).status ?? 'OPEN') as never,

  prediction: async (parent) => {
    const attached = wac(parent).prediction;
    // Synthesized nodes always set the key (possibly null) — trust it.
    if (attached !== undefined) return attached;
    // Fallback for non-synthesized parents: first holder-side prediction
    // by row id — the deterministic version of v1's include-order pick
    // (sdl/resolvers/queries/escrow.ts L494-511, `predictionId ??=`).
    return prisma.prediction.findFirst({
      where: {
        pickConfigId: parent.pickConfigId,
        ...(parent.isPredictorToken
          ? { predictor: parent.holder }
          : { counterparty: parent.holder }),
      },
      orderBy: { id: 'asc' },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  },
};
