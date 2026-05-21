/**
 * Forecast model resolvers. Backed by the Prisma `attestation` table
 * (table name kept for DB compatibility); the public GraphQL surface
 * uses the `Forecast` / `forecaster` / `attestedAt` naming.
 *
 * `condition` rides the existing `conditionById` DataLoader. The legacy
 * `where: ConditionWhereInput` arg is vestigial — when present, fall
 * through to the per-row path to preserve filter semantics.
 */

import type { ForecastResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaForecast = {
  id: number;
  time: number;
  attester: string;
  conditionId?: string | null;
  condition?: unknown;
  [k: string]: unknown;
};

export const Forecast: ForecastResolvers = {
  attestedAt: (parent) => (parent as unknown as PrismaForecast).time,
  forecaster: (parent) => (parent as unknown as PrismaForecast).attester,

  condition: async (parent, args, ctx) => {
    const p = parent as unknown as PrismaForecast;
    if (p.condition !== undefined) return p.condition as never;
    if (p.conditionId == null) return null;
    if (ctx.loaders && (!args || args.where == null)) {
      return ctx.loaders.conditionById.load(p.conditionId) as never;
    }
    return loadRelation(p, 'condition', {
      parentModel: 'attestation',
      parentWhere: { id: p.id },
      prismaRelationName: 'condition',
      args,
    });
  },

  forecastScore: async (parent, args) =>
    loadRelation(parent as unknown as PrismaForecast, 'attestationScore', {
      parentModel: 'attestation',
      parentWhere: { id: (parent as unknown as PrismaForecast).id },
      prismaRelationName: 'attestationScore',
      args,
    }),
};
