export {
  extractSessionKeyFromValidatorData,
  parseZeroDevApproval,
  verifySessionApproval,
  extractApprovalForTransport,
  type ParsedApproval,
  type EnableTypedData,
  type SessionApprovalPayload,
} from './verification';

// computeSmartAccountAddress is NOT re-exported from this barrel to avoid
// pulling @zerodev/ecdsa-validator (and its broken permissionless import)
// into client bundles via Turbopack. Import directly from './smartAccount'
// when needed (server-side only, e.g. relayer).
