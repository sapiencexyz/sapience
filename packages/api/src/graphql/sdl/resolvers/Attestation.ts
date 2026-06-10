/**
 * Attestation model resolvers. Relation names match between Prisma
 * and SDL: `condition` (single), `attestation_score` (single, the
 * literal snake_case name carries through from the Prisma column).
 */

import type { AttestationResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaAttestation = { id: number; [k: string]: unknown };

export const Attestation: AttestationResolvers = {
  condition: async (parent, args) =>
    loadRelation(parent as PrismaAttestation, 'condition', {
      parentModel: 'attestation',
      parentWhere: { id: (parent as PrismaAttestation).id },
      prismaRelationName: 'condition',
      args,
    }),

  attestation_score: async (parent, args) =>
    loadRelation(parent as PrismaAttestation, 'attestation_score', {
      parentModel: 'attestation',
      parentWhere: { id: (parent as PrismaAttestation).id },
      prismaRelationName: 'attestation_score',
      args,
    }),
};
