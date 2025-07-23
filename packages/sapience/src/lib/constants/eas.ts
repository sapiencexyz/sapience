// Chain-specific EAS contract addresses
const EAS_CONTRACT_ADDRESSES: Record<number, string> = {
  8453: '0x4200000000000000000000000000000000000021', // Base
  432: '0x4200000000000000000000000000000000000021', // Converge (assuming same address)
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587', // Ethereum mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
};

// Chain-specific EAS GraphQL endpoints
const EAS_GRAPHQL_ENDPOINTS: Record<number, string> = {
  8453: 'https://base.easscan.org/graphql', // Base
  432: '', // Converge - no EAS explorer yet, will need to be configured
  1: 'https://easscan.org/graphql', // Ethereum mainnet
  11155111: 'https://sepolia.easscan.org/graphql', // Sepolia
};

// Chain-specific EAS explorer URLs
const EAS_EXPLORER_URLS: Record<number, string> = {
  8453: 'https://base.easscan.org', // Base
  432: '', // Converge - no EAS explorer yet
  1: 'https://easscan.org', // Ethereum mainnet
  11155111: 'https://sepolia.easscan.org', // Sepolia
};

export const SCHEMA_UID =
  '0x70c5a48f8bf98f877e109501da138243aec847479a69c09390eb468f0b349fc4';

// Utility functions
export const getEASContractAddress = (chainId: number): string => {
  return EAS_CONTRACT_ADDRESSES[chainId] || EAS_CONTRACT_ADDRESSES[8453]; // Fallback to Base
};

export const getEASGraphQLEndpoint = (chainId: number): string => {
  return EAS_GRAPHQL_ENDPOINTS[chainId] || '';
};

export const getEASExplorerURL = (chainId: number): string => {
  return EAS_EXPLORER_URLS[chainId] || '';
};

export const getAttestationViewURL = (chainId: number, attestationId: string): string => {
  const baseUrl = getEASExplorerURL(chainId);
  return baseUrl ? `${baseUrl}/attestation/view/${attestationId}` : '';
};

// Legacy export for backward compatibility
export const EAS_CONTRACT_ADDRESS = getEASContractAddress(8453);
