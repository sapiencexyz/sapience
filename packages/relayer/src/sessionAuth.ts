// Re-export session verification utilities from SDK
// This maintains backward compatibility while centralizing the implementation
export {
  extractSessionKeyFromValidatorData,
  parseZeroDevApproval,
  verifySessionApproval,
  extractApprovalForTransport,
  type ParsedApproval,
  type EnableTypedData,
  type SessionApprovalPayload,
} from '@sapience/sdk/session';

// Imported directly to avoid pulling @zerodev/ecdsa-validator into client bundles
export { computeSmartAccountAddress } from '@sapience/sdk/session/smartAccount';
