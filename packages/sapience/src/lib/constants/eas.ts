// Chain-specific EAS explorer URLs
const EAS_EXPLORER_URLS: Record<number, string> = {
  8453: 'https://base.easscan.org', // Base
  432: '', // Converge - no EAS explorer yet
  1: 'https://easscan.org', // Ethereum mainnet
  11155111: 'https://sepolia.easscan.org', // Sepolia
  42161: 'https://arbitrum.easscan.org', // Arbitrum
};

export const SCHEMA_UID =
  '0x2dbb0921fa38ebc044ab0a7fe109442c456fb9ad39a68ce0a32f193744d17744';

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
