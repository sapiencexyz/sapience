/**
 * ForecastScore model resolvers. One back-reference relation:
 * `forecast` (single).
 *
 * Backed by the Prisma `attestationScore` table (table name kept for
 * DB compatibility); the GraphQL surface uses the renamed
 * `ForecastScore` / `forecast` field naming.
 */

import type { ForecastScoreResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaAttestationScore = { id: number; [k: string]: unknown };

export const ForecastScore: ForecastScoreResolvers = {
  forecast: async (parent, args) =>
    loadRelation(parent as PrismaAttestationScore, 'attestation', {
      parentModel: 'attestationScore',
      parentWhere: { id: (parent as PrismaAttestationScore).id },
      prismaRelationName: 'attestation',
      args,
    }),
  forecastId: (parent) =>
    (parent as unknown as { attestationId: number }).attestationId,
  forecaster: (parent) => (parent as unknown as { attester: string }).attester,
};
