import type { Address } from 'viem';

export type ChainId = 42161 | 5064014 | number;

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
  5064014: {
    address: '0xdC1Fa830aD1de01f1EF603749f48bD73384286BE',
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

// ============================================
// Escrow Contract Addresses
// ============================================

/**
 * PredictionMarketEscrow
 * Core escrow contract handling mint, settle, redeem, burn
 * TODO: Update addresses after mainnet deployment
 */
export const predictionMarketEscrow: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-17
    address: '0xb5d2E6B148eBdFB02a3456F0Af021FAe81356511',
    blockCreated: 2264547,
    legacy: ['0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1'] as const,
  },
} as const;

/**
 * PredictionMarketVault
 * Passive liquidity vault for escrow protocol
 * TODO: Update addresses after mainnet deployment
 */
export const predictionMarketVault: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-18
    address: '0xADf3C8D4B159FdA439E3C0e519DEc3C93DE0a4c3',
    legacy: [] as const,
  },
} as const;

/**
 * PythConditionResolver
 * Pyth oracle-based condition resolution
 */
export const pythConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
} as const;

/**
 * ManualConditionResolver
 * Admin-controlled condition resolution (for testing/mocks)
 */
export const manualConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-17
    address: '0x9938583eA9a6450Cc64502bDcBF76f4EEa2F9560',
    legacy: ['0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A'] as const,
  },
} as const;

/**
 * LZConditionResolver
 * LayerZero cross-chain condition resolution
 */
export const lzConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
} as const;

/**
 * PredictionMarketBridge
 * Bridge contract on source chain (Ethereal)
 */
export const predictionMarketBridge: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-17
    address: '0xAe66B4DED22bED7bE9385c29ADEc7AC9e1B97700',
    legacy: ['0x275Ba9B8DB207afb33022043848216BB7195eDb5'] as const,
  },
} as const;

/**
 * PredictionMarketBridgeRemote
 * Bridge contract on remote chain (Arbitrum)
 */
export const predictionMarketBridgeRemote: ChainAddressMap = {
  42161: {
    // Arbitrum mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — deployed 2026-02-17
    address: '0xE64ca8f0533422BCb6d48dCF11DB2fF3FA26B7Fb',
    legacy: ['0x1a7F19Ee50FBCa9a4d195E4a3737e7737b252b4c'] as const,
  },
} as const;

/**
 * PredictionMarketTokenFactory
 * CREATE3 factory for deterministic token addresses on remote chain
 */
export const predictionMarketTokenFactory: ChainAddressMap = {
  42161: {
    // Arbitrum mainnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — deployed 2026-02-17
    address: '0xD0734eb4b22eFc22F53254C276e8A3095740600a',
    legacy: ['0x0daA1bC7FC4d7f2753FdB65e0AD96b97361385A3'] as const,
  },
} as const;

// Legacy exports
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

// Escrow exports
export const escrowContracts = {
  predictionMarketEscrow,
  predictionMarketVault,
  pythConditionResolver,
  manualConditionResolver,
  lzConditionResolver,
  predictionMarketBridge,
  predictionMarketBridgeRemote,
  predictionMarketTokenFactory,
};

