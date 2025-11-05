import { CHAIN_ID_ARBITRUM } from './constants';

// Read chainId from localStorage
export const getChainIdFromLocalStorage = (): number => {
  if (typeof window === 'undefined') return CHAIN_ID_ARBITRUM;
  try {
    const stored = window.localStorage.getItem('sapience.settings.chainId');
    return stored ? parseInt(stored, 10) : CHAIN_ID_ARBITRUM;
  } catch {
    return CHAIN_ID_ARBITRUM;
  }
};
