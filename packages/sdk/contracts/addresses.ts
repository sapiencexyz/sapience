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
  13374202: {
    address: '0x7b00088CA92d4f11F305CC61758De3580a730f39',
    legacy: [] as const,
  },
} as const;

export const predictionMarketLZConditionalTokensResolver: ChainAddressMap = {
  13374202: {
    address: '0x04aD4e8AE0F828E4BeA2C86165a7800Db499e0F5',
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
    address: '0xd82F211D0d9bE9A73a829A5F1f0e34b02Bf2FB36',
    legacy: [] as const,
  },
  13374202: {
    address: '0x2A97702591ACCbF330c6c813C46DE287653eb645',
    legacy: [] as const,
  },
} as const;

export const lzUmaResolver: ChainAddressMap = {
  42161: {
    address: '0x77Bf3900D79D7Ba4DAEfEb5Ed4D216308dbfbf53',
    legacy: [] as const,
  },
  421614: {
    address: '0x26DB702647e56B230E15687bFbC48b526E131dAe',
    legacy: [] as const,
  }

} as const;

/**
 * PythResolver
 *
 * NOTE: These are intentionally placeholder addresses so the app can wire the
 * correct resolver selection + encoding. Update them to the real deployed
 * resolver addresses for each chain when available.
 */
export const pythResolver: ChainAddressMap = {
  42161: {
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  5064014: {
    address: '0xD076c9fADC49061920e75b1a3a45642712F90F35',
    legacy: [] as const,
  },
  13374202: {
    address: '0x0000000000000000000000000000000000000000',
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
  13374202: {
    address: '0xb52883b935796Ef6d881B22B4fA9d46a374905D7',
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
  13374202: {
    address: '0xb7ae43711d85c23dc862c85b9c95a64dc6351f90',
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
  13374202: {
    address: '0x680022513d33306E47441FB622D2E5CECCc089AC',
    legacy: [] as const,
  },
} as const;

export const contracts = {
  predictionMarket,
  predictionMarketLZConditionalTokensResolver,
  umaResolver,
  lzPMResolver,
  lzUmaResolver,
  pythResolver,
  passiveLiquidityVault,
  collateralToken,
  eas,
};

