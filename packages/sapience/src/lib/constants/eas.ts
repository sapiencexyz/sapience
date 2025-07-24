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
export const getEASExplorerURL = (chainId: number): string => {
  return EAS_EXPLORER_URLS[chainId] || '';
};

export const getAttestationViewURL = (
  chainId: number,
  attestationId: string
): string => {
  const baseUrl = getEASExplorerURL(chainId);
  return baseUrl ? `${baseUrl}/attestation/view/${attestationId}` : '';
};
