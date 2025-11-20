import { CHAIN_ID_ETHEREAL } from './constants';

// Read chainId from localStorage
export const getChainIdFromLocalStorage = (): number => {
  if (typeof window === 'undefined') return CHAIN_ID_ETHEREAL;
  try {
    const stored = window.localStorage.getItem(
      'sapience.settings.selectedChainId'
    );
    return stored ? parseInt(stored, 10) : CHAIN_ID_ETHEREAL;
  } catch {
    return CHAIN_ID_ETHEREAL;
  }
};
