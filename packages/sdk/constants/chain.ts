export const CHAIN_ID_ARBITRUM = 42161 as const;
export const CHAIN_ID_ETHEREAL = 5064014 as const;

export const DEFAULT_CHAIN_ID = CHAIN_ID_ARBITRUM;

export const COLLATERAL_SYMBOLS: Record<number, string> = {
  [CHAIN_ID_ARBITRUM]: 'testUSDe',
  [CHAIN_ID_ETHEREAL]: 'wUSDe',
} as const;
