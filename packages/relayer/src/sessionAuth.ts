// Re-export session verification utilities from SDK
// This maintains backward compatibility while centralizing the implementation
export {
  extractSessionKeyFromValidatorData,
  parseZeroDevApproval,
  verifySessionApproval,
  extractApprovalForTransport,
  computeSmartAccountAddress,
  type ParsedApproval,
  type EnableTypedData,
  type SessionApprovalPayload,
} from '@sapience/sdk/session';
