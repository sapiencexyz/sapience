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
    address: '0xADf3C8D4B159FdA439E3C0e519DEc3C93DE0a4c3',
    legacy: ['0xb52883b935796Ef6d881B22B4fA9d46a374905D7'] as const,
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
 */
export const predictionMarketEscrow: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-26
    address: '0x23C765fcE26aDbA3A1e0790d548410367D5A3487',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-26
    address: '0x3025C4E3087f33Ac04D78eE34f35D4d003c2D642',
    legacy: [
      '0x7Bd9b22F89ECa14C5afa4de37Ae7B15C80de7a69',
      '0x32Bf5903EA9c98FB20eB07735a8e62D303B60B3C',
      '0xb5d2E6B148eBdFB02a3456F0Af021FAe81356511',
      '0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1',
    ] as const,
  },
} as const;

/**
 * PredictionMarketVault
 * Passive liquidity vault for escrow protocol
 * TODO: Update addresses after mainnet deployment
 */
export const predictionMarketVault: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-03-01
    address: '0x658fF0e00a1B4c0b0fe7D72A82598BfD3cc0Cea1',
    legacy: ['0x5704dB4b2c068d74Fde25257106a7029463f812E'] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-03-01
    address: '0xDeb1Ac14EbE15c64e7e78103121335D831968D0b',
    legacy: ['0xADf3C8D4B159FdA439E3C0e519DEc3C93DE0a4c3'] as const,
  },
} as const;

/**
 * PythConditionResolver
 * Pyth oracle-based condition resolution
 */
export const pythConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-28
    address: '0x6399F6397701e4213BBaEf9f7a15EF31C9c329E1',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-28
    address: '0xe29568D2ec56dD25D62f05eF28f7EC7C1C899D7c',
    legacy: [] as const,
  },
} as const;

/**
 * ConditionalTokensConditionResolver
 * Receives Gnosis CT resolution data from Polygon via LayerZero
 */
export const conditionalTokensConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-28
    address: '0x130598b7334901077cA5369b098Fd47F042CdcC9',
    legacy: [] as const,
  },
} as const;

/**
 * ConditionalTokensReader
 * Reads Gnosis CT payouts on Polygon and sends to Ethereal via LayerZero
 */
export const conditionalTokensReader: ChainAddressMap = {
  137: {
    // Polygon mainnet — deployed 2026-02-28
    address: '0x882288A664e29aEBC654Fa9679697d23716fcCD1',
    legacy: ['0x97b356E9689dCEa3a268Ac6D7d8A87A24fa95ae2'] as const,
  },
} as const;

/**
 * ManualConditionResolver
 * Admin-controlled condition resolution (for testing/mocks)
 */
export const manualConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-26
    address: '0xAdFcDD47f8E09D5Cc00B25d2bbC3A8fdc3Ad4674',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-26
    address: '0x9f0fA333e634b9E11CbcA0fC16123912b941F7Bd',
    legacy: [
      '0x31C51d3a6e01a9F15144429ebc71E8815157a0aD',
      '0xAE41b42dC5d9a98C53c7A91c44523173300c1f31',
      '0x9938583eA9a6450Cc64502bDcBF76f4EEa2F9560',
      '0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A',
    ] as const,
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
    // Ethereal mainnet — deployed 2026-02-26
    address: '0xf3a0026Bd8Bf3B3ca41177C93b99F97dfB657506',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-26
    address: '0xAf0c78547018F9e2e515e6Fc0064DD091f3dDE38',
    legacy: [
      '0x1F6eF06A42860973A7Ad2A27A4Def0aa78eF49c3',
      '0xAE32505E17Ff704df7Cd22E99916360328915BEb',
      '0xAe66B4DED22bED7bE9385c29ADEc7AC9e1B97700',
      '0x275Ba9B8DB207afb33022043848216BB7195eDb5',
    ] as const,
  },
} as const;

/**
 * PredictionMarketBridgeRemote
 * Bridge contract on remote chain (Arbitrum)
 */
export const predictionMarketBridgeRemote: ChainAddressMap = {
  42161: {
    // Arbitrum mainnet — deployed 2026-02-26
    address: '0x136700DBA1cCC2eDd16aB0bf439bd6b65574F99f',
    legacy: [] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — deployed 2026-02-26
    address: '0x4e52A5D1FaCcd4ebb97cEf22E91760662C7eDb54',
    legacy: [
      '0x06e2a473aA8652666aa7F1AF8808559b2164c89F',
      '0x888e445F96515186B7b262d959FFF4AF14151ca9',
      '0xE64ca8f0533422BCb6d48dCF11DB2fF3FA26B7Fb',
      '0x1a7F19Ee50FBCa9a4d195E4a3737e7737b252b4c',
    ] as const,
  },
} as const;

/**
 * PredictionMarketTokenFactory
 * CREATE3 factory for deterministic token addresses on remote chain
 */
export const predictionMarketTokenFactory: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-26 (CREATE2 deterministic, same address on both chains)
    address: '0x82b1b600DaCFcff4Cc1e3bD02c542222597e5Fe2',
    legacy: [] as const,
  },
  42161: {
    // Arbitrum mainnet — deployed 2026-02-26 (CREATE2 deterministic, same address on both chains)
    address: '0x82b1b600DaCFcff4Cc1e3bD02c542222597e5Fe2',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — deployed 2026-02-26 (CREATE2 deterministic, same address on both chains)
    address: '0x9924518205391c0443fA565327108afB3E100b51',
    legacy: [
      '0x6a53c3A010D0Bd9E4BE4815959413A379d5bfDDF',
      '0xA2566AF673d4fe3174d0fBDe5ee8cadfc0c684b5',
      '0xcbf9eB6AF28fBCc7c19760aC230cC216113742d0',
    ] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — deployed 2026-02-26 (CREATE2 deterministic, same address on both chains)
    address: '0x9924518205391c0443fA565327108afB3E100b51',
    legacy: [
      '0x6a53c3A010D0Bd9E4BE4815959413A379d5bfDDF',
      '0xA2566AF673d4fe3174d0fBDe5ee8cadfc0c684b5',
      '0xD0734eb4b22eFc22F53254C276e8A3095740600a',
      '0x0daA1bC7FC4d7f2753FdB65e0AD96b97361385A3',
    ] as const,
  },
} as const;

/**
 * SecondaryMarketEscrow (V2)
 * Atomic OTC swap for position tokens
 * Deployed: 0x0c12a974E7741135a8431458705Ae16dDa41aA85 (Ethereal testnet)
 */
export const secondaryMarketEscrow: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — deployed 2026-02-26
    address: '0xc46C3140D2c776f83Cf908B3b93f20165e294064',
    legacy: [] as const,
  },
  13374202: {
    // Ethereal testnet — redeployed 2026-02-26 (bitmap nonces + session key revocation)
    address: '0x16222940184Aad2E806529C963531e36c13875cF',
    legacy: ['0x0c12a974E7741135a8431458705Ae16dDa41aA85'] as const,
  },
} as const;

/**
 * OnboardingSponsor
 * Budget-gated sponsor for onboarding new users via invite codes.
 * The budgetManager (API signer) calls setBudget when a user claims an invite code,
 * then the escrow calls fundMint during sponsored mints.
 * TODO: Update addresses after deployment
 */
export const onboardingSponsor: ChainAddressMap = {
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
  secondaryMarketEscrow,
  onboardingSponsor,
  pythConditionResolver,
  manualConditionResolver,
  lzConditionResolver,
  conditionalTokensConditionResolver,
  conditionalTokensReader,
  predictionMarketBridge,
  predictionMarketBridgeRemote,
  predictionMarketTokenFactory,
};

