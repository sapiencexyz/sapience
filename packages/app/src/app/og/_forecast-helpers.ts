// Re-exports from shared data layer for backward compatibility with OG routes.
export {
  type AttestationCondition,
  type AttestationData,
  ATTESTATION_BY_UID_QUERY,
  d18ToPercentage,
  fetchAttestationByUid,
} from '~/lib/data/forecasts';

export { getGraphQLEndpoint } from '~/lib/data/graphql';
