import type { Address } from 'viem';

export type ChainId = 42161 | 5064014 | number;

export interface LegacyContractEntry {
  address: Address;
  blockCreated: number;
}

export interface ContractAddressEntry {
  address: Address;
  blockCreated?: number;
  legacy?: readonly (Address | LegacyContractEntry)[];
}

export type ChainAddressMap = Record<ChainId, ContractAddressEntry>;

export const collateralToken: ChainAddressMap = {
  42161: {
    address: '0xfeb8c4d5efbaff6e928ea090bc660c363f883dba',
    legacy: [] as const,
  },
  5064014: {
    address: '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D',
    blockCreated: 18537,
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

/**
 * PredictionMarketEscrow
 * Core escrow contract handling mint, settle, redeem, burn
 */
export const predictionMarketEscrow: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — redeployed 2026-03-13
    address: '0xEF6B5C544814a3c5E335b6D2BAec6CBDe0f97A76',
    legacy: [
      {
        address: '0x243022eBf5d66741499d76555CADFDE51e101e03',
        blockCreated: 3562422,
      },
      {
        address: '0xC18ed3483733d4e15516c2Fe101fF20B61e88A55',
        blockCreated: 3499800,
      },
      {
        address: '0x23C765fcE26aDbA3A1e0790d548410367D5A3487',
        blockCreated: 3253196,
      },
    ] as const,
  },
  13374202: {
    // Ethereal testnet — redeployed 2026-03-13
    address: '0x3B680e06B9A384179644C1bC7842Db67Df5Fb5f0',
    legacy: [
      {
        address: '0x3025C4E3087f33Ac04D78eE34f35D4d003c2D642',
        blockCreated: 2294248,
      },
      {
        address: '0x7Bd9b22F89ECa14C5afa4de37Ae7B15C80de7a69',
        blockCreated: 2294058,
      },
      {
        address: '0x32Bf5903EA9c98FB20eB07735a8e62D303B60B3C',
        blockCreated: 2293993,
      },
      {
        address: '0xb5d2E6B148eBdFB02a3456F0Af021FAe81356511',
        blockCreated: 2264547,
      },
      {
        address: '0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1',
        blockCreated: 2107812,
      },
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
    // Ethereal mainnet — deployed 2026-03-05
    address: '0x0f246fBd64f6FE57544aAB16A31e1E3F59257723',
    legacy: [
      {
        address: '0x5704dB4b2c068d74Fde25257106a7029463f812E',
        blockCreated: 3253965,
      },
    ] as const,
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
    // Ethereal mainnet — redeployed 2026-03-13
    address: '0x3384de2a15e8D767a36f09f6e67F41C9fa8C6B1f',
    legacy: [
      {
        address: '0x6399F6397701e4213BBaEf9f7a15EF31C9c329E1',
        blockCreated: 3278610,
      },
    ] as const,
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
    // Ethereal mainnet — redeployed 2026-03-13
    address: '0x19e34DB5bef20EF0613854c3670cD809DEFf4035',
    legacy: [
      {
        address: '0x130598b7334901077cA5369b098Fd47F042CdcC9',
        blockCreated: 3278696,
      },
    ] as const,
  },
} as const;

/**
 * ConditionalTokensReader
 * Reads Gnosis CT payouts on Polygon and sends to Ethereal via LayerZero
 */
export const conditionalTokensReader: ChainAddressMap = {
  137: {
    // Polygon mainnet — redeployed 2026-03-17
    address: '0x79cB914f3F336426E89FaB55A9488AB25770552D',
    legacy: [
      {
        address: '0x882288A664e29aEBC654Fa9679697d23716fcCD1',
        blockCreated: 0,
      },
      {
        address: '0x97b356E9689dCEa3a268Ac6D7d8A87A24fa95ae2',
        blockCreated: 0,
      },
    ] as const,
  },
} as const;

/**
 * ManualConditionResolver
 * Admin-controlled condition resolution (for testing/mocks)
 */
export const manualConditionResolver: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — redeployed 2026-03-13
    address: '0x3791b6B4B80c1aDEeb37350F63825E43722a3573',
    legacy: [
      {
        address: '0x07a93E42afBCf747B8a9180e61b890888eF813F4',
        blockCreated: 3659073,
      },
      {
        address: '0xAdFcDD47f8E09D5Cc00B25d2bbC3A8fdc3Ad4674',
        blockCreated: 3253178,
      },
    ] as const,
  },
  13374202: {
    // Ethereal testnet — redeployed 2026-03-13
    address: '0xa5ec46b834aC33ec68e30E7dDeedbbbD4f461784',
    legacy: [
      {
        address: '0x5fa66D9021490BC7479B33D226C70Dd3C91AF399',
        blockCreated: 2537087,
      },
      {
        address: '0x9f0fA333e634b9E11CbcA0fC16123912b941F7Bd',
        blockCreated: 2294246,
      },
      {
        address: '0x31C51d3a6e01a9F15144429ebc71E8815157a0aD',
        blockCreated: 2294057,
      },
      {
        address: '0xAE41b42dC5d9a98C53c7A91c44523173300c1f31',
        blockCreated: 2293991,
      },
      {
        address: '0x9938583eA9a6450Cc64502bDcBF76f4EEa2F9560',
        blockCreated: 2264546,
      },
      {
        address: '0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A',
        blockCreated: 2107805,
      },
    ] as const,
  },
} as const;

/**
 * PredictionMarketBridge
 * Bridge contract on source chain (Ethereal)
 */
export const predictionMarketBridge: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — redeployed 2026-03-13
    address: '0x4091E14e114733FB888fD24E24bCaA70E955c07B',
    legacy: [
      {
        address: '0x6660a7AC974BDc06b54B82842088821407A67c03',
        blockCreated: 3562429,
      },
      {
        address: '0x7Ac66f19Cb9B4540A0aF02eeA406f413138D659A',
        blockCreated: 3499804,
      },
      {
        address: '0xf3a0026Bd8Bf3B3ca41177C93b99F97dfB657506',
        blockCreated: 3253210,
      },
    ] as const,
  },
  13374202: {
    // Ethereal testnet — redeployed 2026-03-13
    address: '0xd45D795A3eB5890ad3Ff127C29b3A191D8A06F44',
    legacy: [
      {
        address: '0xAf0c78547018F9e2e515e6Fc0064DD091f3dDE38',
        blockCreated: 2294253,
      },
      {
        address: '0x1F6eF06A42860973A7Ad2A27A4Def0aa78eF49c3',
        blockCreated: 2294060,
      },
      {
        address: '0xAE32505E17Ff704df7Cd22E99916360328915BEb',
        blockCreated: 2293995,
      },
      {
        address: '0xAe66B4DED22bED7bE9385c29ADEc7AC9e1B97700',
        blockCreated: 2264550,
      },
      {
        address: '0x275Ba9B8DB207afb33022043848216BB7195eDb5',
        blockCreated: 2107823,
      },
    ] as const,
  },
} as const;

/**
 * PredictionMarketBridgeRemote
 * Bridge contract on remote chain (Arbitrum)
 */
export const predictionMarketBridgeRemote: ChainAddressMap = {
  42161: {
    // Arbitrum mainnet — redeployed 2026-03-13
    address: '0x39fCc2898C471048A519B316188aB196F2ECb08A',
    legacy: [
      {
        address: '0x5BdAb642A8e5d2B1eaba93456eDc2F11FAecb0b7',
        blockCreated: 441025284,
      },
      {
        address: '0x49FD85a1Bf0C449A516Bf2a45d6106Bef7150aD5',
        blockCreated: 441018295,
      },
      {
        address: '0x136700DBA1cCC2eDd16aB0bf439bd6b65574F99f',
        blockCreated: 436762121,
      },
    ] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — redeployed 2026-03-13
    address: '0x11B74d5a4aF9c83FF6610C0FaA8EC5378077Eb16',
    legacy: [
      {
        address: '0x4e52A5D1FaCcd4ebb97cEf22E91760662C7eDb54',
        blockCreated: 252903704,
      },
      {
        address: '0x06e2a473aA8652666aa7F1AF8808559b2164c89F',
        blockCreated: 252901852,
      },
      {
        address: '0x888e445F96515186B7b262d959FFF4AF14151ca9',
        blockCreated: 252901943,
      },
      {
        address: '0xE64ca8f0533422BCb6d48dCF11DB2fF3FA26B7Fb',
        blockCreated: 252904306,
      },
      {
        address: '0x1a7F19Ee50FBCa9a4d195E4a3737e7737b252b4c',
        blockCreated: 252901832,
      },
    ] as const,
  },
} as const;

/**
 * PredictionMarketTokenFactory
 * CREATE3 factory for deterministic token addresses on remote chain
 */
export const predictionMarketTokenFactory: ChainAddressMap = {
  5064014: {
    // Ethereal mainnet — redeployed 2026-03-13 (CREATE2 deterministic, same address on both chains)
    address: '0xea76782164474ec59b647C5be21FAFD0Ecf936BD',
    legacy: [
      {
        address: '0xD838d19E910Dc4d235B1A7548BF86B08F9b1241D',
        blockCreated: 3562421,
      },
      {
        address: '0xe51f86ff77388c108Aa77A629b82713FF5233FE2',
        blockCreated: 3499797,
      },
      {
        address: '0x82b1b600DaCFcff4Cc1e3bD02c542222597e5Fe2',
        blockCreated: 3253184,
      },
    ] as const,
  },
  42161: {
    // Arbitrum mainnet — redeployed 2026-03-13 (CREATE2 deterministic, same address on both chains)
    address: '0xea76782164474ec59b647C5be21FAFD0Ecf936BD',
    legacy: [
      {
        address: '0xD838d19E910Dc4d235B1A7548BF86B08F9b1241D',
        blockCreated: 441015320,
      },
      {
        address: '0xe51f86ff77388c108Aa77A629b82713FF5233FE2',
        blockCreated: 442253903,
      },
      {
        address: '0x82b1b600DaCFcff4Cc1e3bD02c542222597e5Fe2',
        blockCreated: 436762123,
      },
    ] as const,
  },
  13374202: {
    // Ethereal testnet — redeployed 2026-03-13 (CREATE2 deterministic, same address on both chains)
    address: '0x5B9f2cb9c822899A0F824eEb039B628A4d13d7AD',
    legacy: [
      {
        address: '0x9924518205391c0443fA565327108afB3E100b51',
        blockCreated: 2294247,
      },
      {
        address: '0x6a53c3A010D0Bd9E4BE4815959413A379d5bfDDF',
        blockCreated: 2294038,
      },
      {
        address: '0xA2566AF673d4fe3174d0fBDe5ee8cadfc0c684b5',
        blockCreated: 2293992,
      },
      {
        address: '0xcbf9eB6AF28fBCc7c19760aC230cC216113742d0',
        blockCreated: 2293665,
      },
    ] as const,
  },
  421614: {
    // Arbitrum Sepolia testnet — redeployed 2026-03-13 (CREATE2 deterministic, same address on both chains)
    address: '0x5B9f2cb9c822899A0F824eEb039B628A4d13d7AD',
    legacy: [
      {
        address: '0x9924518205391c0443fA565327108afB3E100b51',
        blockCreated: 252904693,
      },
      {
        address: '0x6a53c3A010D0Bd9E4BE4815959413A379d5bfDDF',
        blockCreated: 252901121,
      },
      {
        address: '0xA2566AF673d4fe3174d0fBDe5ee8cadfc0c684b5',
        blockCreated: 252903523,
      },
      {
        address: '0xD0734eb4b22eFc22F53254C276e8A3095740600a',
        blockCreated: 252901145,
      },
      {
        address: '0x0daA1bC7FC4d7f2753FdB65e0AD96b97361385A3',
        blockCreated: 252901123,
      },
    ] as const,
  },
} as const;

/**
 * SecondaryMarketEscrow
 * Atomic OTC swap for position tokens
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
    legacy: [
      {
        address: '0x0c12a974E7741135a8431458705Ae16dDa41aA85',
        blockCreated: 2266775,
      },
    ] as const,
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
    // Ethereal mainnet — redeployed 2026-03-17
    address: '0xFB177fd4eC88b813e88178Fa898D75651Dece8ED',
    legacy: [
      {
        address: '0x4DDB0fD9be45c3F86aF25B661a0e18403DB0602d',
        blockCreated: 3563212,
      },
    ] as const,
  },
  13374202: {
    // Ethereal testnet - TODO: deploy
    address: '0x0000000000000000000000000000000000000000',
    legacy: [] as const,
  },
} as const;

/** Normalize a legacy entry (Address | LegacyContractEntry) to { address, blockCreated }. */
export function normalizeLegacyEntry(
  entry: Address | LegacyContractEntry
): LegacyContractEntry {
  if (typeof entry === 'string') {
    return { address: entry, blockCreated: 0 };
  }
  return entry;
}

export const contracts = {
  collateralToken,
  eas,
  predictionMarketEscrow,
  predictionMarketVault,
  secondaryMarketEscrow,
  onboardingSponsor,
  pythConditionResolver,
  manualConditionResolver,
  conditionalTokensConditionResolver,
  conditionalTokensReader,
  predictionMarketBridge,
  predictionMarketBridgeRemote,
  predictionMarketTokenFactory,
};

// ============================================================================
// Resolver Helpers
// ============================================================================

export type ResolverType = 'pyth' | 'conditionalTokens' | 'manual';

const RESOLVER_MAP: Record<ResolverType, ChainAddressMap> = {
  pyth: pythConditionResolver,
  conditionalTokens: conditionalTokensConditionResolver,
  manual: manualConditionResolver,
};

/** Get the deployed resolver address for a given type and chain. */
export function getResolverAddress(
  type: ResolverType,
  chainId: number
): Address | undefined {
  return RESOLVER_MAP[type]?.[chainId]?.address;
}

/** Get all deployed (non-zero) resolver addresses for a given chain. */
export function getResolverAddressesForChain(
  chainId: number
): { type: ResolverType; address: Address }[] {
  const zero = '0x0000000000000000000000000000000000000000';
  const result: { type: ResolverType; address: Address }[] = [];
  for (const [type, map] of Object.entries(RESOLVER_MAP) as [
    ResolverType,
    ChainAddressMap,
  ][]) {
    const addr = map[chainId]?.address;
    if (addr && addr !== zero) {
      result.push({ type, address: addr });
    }
  }
  return result;
}

/** Get all legacy resolver addresses for a given chain. */
export function getLegacyResolverAddressesForChain(
  chainId: number
): { type: ResolverType; address: Address; blockCreated: number }[] {
  const result: {
    type: ResolverType;
    address: Address;
    blockCreated: number;
  }[] = [];
  for (const [type, map] of Object.entries(RESOLVER_MAP) as [
    ResolverType,
    ChainAddressMap,
  ][]) {
    const entry = map[chainId];
    if (!entry?.legacy) continue;
    for (const leg of entry.legacy) {
      if (typeof leg === 'string') {
        result.push({ type, address: leg, blockCreated: 0 });
      } else {
        result.push({
          type,
          address: leg.address,
          blockCreated: leg.blockCreated,
        });
      }
    }
  }
  return result;
}

/** Identify the resolver type from an on-chain address (current or legacy). */
export function identifyResolver(
  address: string,
  chainId: number
): ResolverType | null {
  const lower = address.toLowerCase();
  for (const [type, map] of Object.entries(RESOLVER_MAP) as [
    ResolverType,
    ChainAddressMap,
  ][]) {
    const entry = map[chainId];
    if (!entry) continue;
    if (entry.address.toLowerCase() === lower) return type;
    // Also check legacy addresses
    if (entry.legacy) {
      for (const leg of entry.legacy) {
        const legAddr = typeof leg === 'string' ? leg : leg.address;
        if (legAddr.toLowerCase() === lower) return type;
      }
    }
  }
  return null;
}
