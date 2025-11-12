import type { Address } from 'viem';

export type ChainId = 10 | 8453 | 42161 | 5064014 | number;

export interface ContractAddressEntry {
  address: Address;
  blockCreated?: number;
  legacy?: readonly Address[];
}

export type ChainAddressMap = Record<ChainId, ContractAddressEntry>;

export const predictionMarket: ChainAddressMap = {
  42161: {
    address: '0xb04841cad1147675505816e2ec5c915430857b40',
    legacy: [] as const,
  },
  5064014: {
    address: '0xAcD757322df2A1A0B3283c851380f3cFd4882cB4',
    legacy: [] as const,
  },
} as const;

export const umaResolver: ChainAddressMap = {
  42161: {
    address: '0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9',
    legacy: [] as const,
  },
} as const;

export const lzPMResolver: ChainAddressMap = {
  5064014: {
    address: '0xC873efA9D22A09e39101efB977C03011620bF015',
    legacy: [] as const,
  },
} as const;

export const lzUmaResolver: ChainAddressMap = {
  42161: {
    address: '0x070Bd542474390c3AFED2DAE85C2d13932c75F17',
    legacy: [] as const,
  },
} as const;

export const passiveLiquidityVault: ChainAddressMap = {
  42161: {
    address: '0xcc1c64e849395d31d059a4bd19391af64d8855d7',
    legacy: [] as const,
  },
  5064014: {
    address: '0x5c1d4feD296d2637205Ac132CE3e030F5d94d026',
    legacy: [] as const,
  },
} as const;

export const collateralToken: ChainAddressMap = {
  42161: {
    address: '0xfeb8c4d5efbaff6e928ea090bc660c363f883dba',
    legacy: [] as const,
  },
  5064014: {
    address: '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D',
    legacy: [] as const,
  },
} as const;

export const eas: ChainAddressMap = {
  42161: {
    address: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458',
    legacy: [] as const,
  },
  5064014: {
    address: '0x6A225f09E0EbE597F79e86875B3704325d40c84d',
    legacy: [] as const,
  },
} as const;

export const contracts = {
  predictionMarket,
  umaResolver,
  lzPMResolver,
  lzUmaResolver,
  passiveLiquidityVault,
  collateralToken,
  eas,
};

