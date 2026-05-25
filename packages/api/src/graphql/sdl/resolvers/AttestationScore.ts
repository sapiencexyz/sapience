/**
 * AttestationScore model resolvers. One back-reference relation:
 * `attestation` (single).
 */

import type { AttestationScoreResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaAttestationScore = { id: number; [k: string]: unknown };

export const AttestationScore: AttestationScoreResolvers = {
  attestation: async (parent, args) =>
    loadRelation(parent as PrismaAttestationScore, 'attestation', {
      parentModel: 'attestationScore',
      parentWhere: { id: (parent as PrismaAttestationScore).id },
      prismaRelationName: 'attestation',
      args,
    }),
};
