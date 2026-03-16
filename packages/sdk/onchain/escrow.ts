import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem';
import { predictionMarketEscrow } from '../contracts/addresses';
import {
  CHAIN_ID_ETHEREAL,
  getChainConfig,
  getRpcUrl,
} from '../constants/chain';
import type {
  Prediction,
  PickConfiguration,
  TokenPair,
  Pick,
  EscrowRecord,
  OutcomeSide,
  SettlementResult,
} from '../types/escrow';
import { ERC20_ABI } from './sharedAbis';

// ============================================================================
// ABI Definitions
// ============================================================================

/** PredictionMarketEscrow view function ABI */
const PREDICTION_MARKET_ESCROW_ABI = parseAbi([
  // View functions
  'function getPrediction(bytes32 predictionId) view returns ((bytes32 predictionId, bytes32 pickConfigId, uint256 predictorCollateral, uint256 counterpartyCollateral, address predictor, address counterparty, uint256 predictorTokensMinted, uint256 counterpartyTokensMinted, bool settled))',
  'function getPickConfiguration(bytes32 pickConfigId) view returns ((bytes32 pickConfigId, uint256 totalPredictorCollateral, uint256 totalCounterpartyCollateral, uint256 claimedPredictorCollateral, uint256 claimedCounterpartyCollateral, bool resolved, uint8 result))',
  'function getTokenPair(bytes32 pickConfigId) view returns ((address predictorToken, address counterpartyToken))',
  'function isNonceUsed(address account, uint256 nonce) view returns (bool used)',
  'function nonceBitmap(address account, uint256 wordPos) view returns (uint256 word)',
  'function canSettle(bytes32 predictionId) view returns (bool)',
  'function getPicks(bytes32 pickConfigId) view returns ((address conditionResolver, bytes conditionId, uint8 predictedOutcome)[])',
  'function getEscrowRecord(bytes32 predictionId) view returns ((bytes32 pickConfigId, uint256 totalCollateral, uint256 predictorCollateral, uint256 counterpartyCollateral, uint256 predictorTokensMinted, uint256 counterpartyTokensMinted, bool settled))',
  'function getClaimableAmount(bytes32 pickConfigId, address positionToken, uint256 tokenAmount) view returns (uint256)',
  'function isPositionToken(address token) view returns (bool)',
  'function isPredictorToken(address token) view returns (bool)',
  'function getPickConfigIdFromToken(address token) view returns (bytes32)',
  'function computePickConfigId((address conditionResolver, bytes conditionId, uint8 predictedOutcome)[] picks) pure returns (bytes32)',
  // Immutable state
  'function collateralToken() view returns (address)',
]);

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a public client for the escrow trading chain
 */
export function createEscrowPublicClient(
  rpcUrl?: string,
  chainId: number = CHAIN_ID_ETHEREAL
): PublicClient<Transport, Chain> {
  const chain = getChainConfig(chainId);

  return createPublicClient({
    chain,
    transport: http(rpcUrl || getRpcUrl(chainId)),
  });
}

/**
 * Get the PredictionMarketEscrow address for a chain
 */
export function getMarketAddress(chainId: number): Address | undefined {
  return predictionMarketEscrow[chainId]?.address as Address | undefined;
}

// ============================================================================
// Read Functions: Prediction Data
// ============================================================================

/**
 * Get prediction data by predictionId
 */
export async function getPrediction(
  predictionId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<Prediction> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  const result = await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getPrediction',
    args: [predictionId],
  });

  return {
    predictionId: result.predictionId,
    pickConfigId: result.pickConfigId,
    predictorCollateral: result.predictorCollateral,
    counterpartyCollateral: result.counterpartyCollateral,
    predictor: result.predictor,
    counterparty: result.counterparty,
    predictorTokensMinted: result.predictorTokensMinted,
    counterpartyTokensMinted: result.counterpartyTokensMinted,
    settled: result.settled,
  };
}

/**
 * Get pick configuration by pickConfigId
 */
export async function getPickConfiguration(
  pickConfigId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<PickConfiguration> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  const result = await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getPickConfiguration',
    args: [pickConfigId],
  });

  return {
    pickConfigId: result.pickConfigId,
    totalPredictorCollateral: result.totalPredictorCollateral,
    totalCounterpartyCollateral: result.totalCounterpartyCollateral,
    claimedPredictorCollateral: result.claimedPredictorCollateral,
    claimedCounterpartyCollateral: result.claimedCounterpartyCollateral,
    resolved: result.resolved,
    result: result.result as SettlementResult,
  };
}

/**
 * Get token pair addresses for a pick configuration
 */
export async function getTokenPair(
  pickConfigId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<TokenPair> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  const result = await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getTokenPair',
    args: [pickConfigId],
  });

  return {
    predictorToken: result.predictorToken,
    counterpartyToken: result.counterpartyToken,
  };
}

/**
 * Get the picks array for a pick configuration
 */
export async function getPicks(
  pickConfigId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<Pick[]> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  const result = await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getPicks',
    args: [pickConfigId],
  });

  return result.map((pick) => ({
    conditionResolver: pick.conditionResolver,
    conditionId: pick.conditionId,
    predictedOutcome: pick.predictedOutcome as OutcomeSide,
  }));
}

/**
 * Get escrow record for a prediction
 */
export async function getEscrowRecord(
  predictionId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<EscrowRecord> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  const result = await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getEscrowRecord',
    args: [predictionId],
  });

  return {
    pickConfigId: result.pickConfigId,
    totalCollateral: result.totalCollateral,
    predictorCollateral: result.predictorCollateral,
    counterpartyCollateral: result.counterpartyCollateral,
    predictorTokensMinted: result.predictorTokensMinted,
    counterpartyTokensMinted: result.counterpartyTokensMinted,
    settled: result.settled,
  };
}

// ============================================================================
// Read Functions: Nonce & Settlement
// ============================================================================

/**
 * Generate a random nonce for the bitmap nonce system (Permit2-style).
 * With bitmap nonces, any unused nonce value is valid - no need to read
 * sequential nonces from the contract. Uses crypto.getRandomValues for
 * strong randomness.
 */
export function generateRandomNonce(): bigint {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  // Range [1, 2^32] - collision probability is negligible
  return BigInt(arr[0]) + 1n;
}

/**
 * Check if a specific nonce has been used for an account
 */
export async function isNonceUsed(
  account: Address,
  nonce: bigint,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
    publicClient?: PublicClient;
  }
): Promise<boolean> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client =
    options?.publicClient ?? createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'isNonceUsed',
    args: [account, nonce],
  });
}

/**
 * Check if a prediction can be settled
 */
export async function canSettle(
  predictionId: Hex,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<boolean> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'canSettle',
    args: [predictionId],
  });
}

/**
 * Calculate claimable amount for a position token amount
 */
export async function getClaimableAmount(
  pickConfigId: Hex,
  positionToken: Address,
  tokenAmount: bigint,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<bigint> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getClaimableAmount',
    args: [pickConfigId, positionToken, tokenAmount],
  });
}

// ============================================================================
// Read Functions: Position Token Utilities
// ============================================================================

/**
 * Check if an address is a valid position token
 */
export async function isPositionToken(
  token: Address,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<boolean> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'isPositionToken',
    args: [token],
  });
}

/**
 * Check if a token is a predictor token (vs counterparty token)
 */
export async function isPredictorToken(
  token: Address,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<boolean> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'isPredictorToken',
    args: [token],
  });
}

/**
 * Get pickConfigId from a position token address
 */
export async function getPickConfigIdFromToken(
  token: Address,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<Hex> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'getPickConfigIdFromToken',
    args: [token],
  });
}

/**
 * Get the collateral token address for the market
 */
export async function getCollateralToken(options?: {
  marketAddress?: Address;
  chainId?: number;
  rpcUrl?: string;
}): Promise<Address> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);
  return await client.readContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ESCROW_ABI,
    functionName: 'collateralToken',
  });
}

// ============================================================================
// Read Functions: ERC20 Position Token Balances
// ============================================================================

/**
 * Get position token balance for an account
 */
export async function getPositionTokenBalance(
  tokenAddress: Address,
  account: Address,
  options?: {
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<bigint> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const client = createEscrowPublicClient(options?.rpcUrl, chainId);

  return await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account],
  });
}

/**
 * Get position token allowance
 */
export async function getPositionTokenAllowance(
  tokenAddress: Address,
  owner: Address,
  spender: Address,
  options?: {
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<bigint> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const client = createEscrowPublicClient(options?.rpcUrl, chainId);

  return await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

/**
 * Get position token total supply
 */
export async function getPositionTokenTotalSupply(
  tokenAddress: Address,
  options?: {
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<bigint> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const client = createEscrowPublicClient(options?.rpcUrl, chainId);

  return await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  });
}

// ============================================================================
// Batch Read Functions
// ============================================================================

/**
 * Get full position details including configuration and token balances
 */
export async function getFullPositionDetails(
  predictionId: Hex,
  account: Address,
  options?: {
    marketAddress?: Address;
    chainId?: number;
    rpcUrl?: string;
  }
): Promise<{
  prediction: Prediction;
  pickConfig: PickConfiguration;
  tokenPair: TokenPair;
  predictorBalance: bigint;
  counterpartyBalance: bigint;
  canSettle: boolean;
}> {
  const chainId = options?.chainId ?? CHAIN_ID_ETHEREAL;
  const marketAddress = options?.marketAddress ?? getMarketAddress(chainId);
  if (!marketAddress)
    throw new Error(`No escrow market address for chain ${chainId}`);

  const client = createEscrowPublicClient(options?.rpcUrl, chainId);

  // Get prediction first to get pickConfigId
  const prediction = await getPrediction(predictionId, options);

  // Use multicall for efficiency
  const [pickConfigResult, tokenPairResult, canSettleResult] =
    await client.multicall({
      contracts: [
        {
          address: marketAddress,
          abi: PREDICTION_MARKET_ESCROW_ABI,
          functionName: 'getPickConfiguration',
          args: [prediction.pickConfigId],
        },
        {
          address: marketAddress,
          abi: PREDICTION_MARKET_ESCROW_ABI,
          functionName: 'getTokenPair',
          args: [prediction.pickConfigId],
        },
        {
          address: marketAddress,
          abi: PREDICTION_MARKET_ESCROW_ABI,
          functionName: 'canSettle',
          args: [predictionId],
        },
      ],
    });

  if (
    pickConfigResult.status !== 'success' ||
    tokenPairResult.status !== 'success'
  ) {
    throw new Error('Failed to fetch position details');
  }

  const pickConfigRaw = pickConfigResult.result;
  const tokenPairRaw = tokenPairResult.result;

  const pickConfig: PickConfiguration = {
    pickConfigId: pickConfigRaw.pickConfigId,
    totalPredictorCollateral: pickConfigRaw.totalPredictorCollateral,
    totalCounterpartyCollateral: pickConfigRaw.totalCounterpartyCollateral,
    claimedPredictorCollateral: pickConfigRaw.claimedPredictorCollateral,
    claimedCounterpartyCollateral: pickConfigRaw.claimedCounterpartyCollateral,
    resolved: pickConfigRaw.resolved,
    result: pickConfigRaw.result as SettlementResult,
  };

  const tokenPair: TokenPair = {
    predictorToken: tokenPairRaw.predictorToken,
    counterpartyToken: tokenPairRaw.counterpartyToken,
  };

  // Get token balances
  const [predictorBalanceResult, counterpartyBalanceResult] =
    await client.multicall({
      contracts: [
        {
          address: tokenPair.predictorToken,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account],
        },
        {
          address: tokenPair.counterpartyToken,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account],
        },
      ],
    });

  return {
    prediction,
    pickConfig,
    tokenPair,
    predictorBalance:
      predictorBalanceResult.status === 'success'
        ? predictorBalanceResult.result
        : 0n,
    counterpartyBalance:
      counterpartyBalanceResult.status === 'success'
        ? counterpartyBalanceResult.result
        : 0n,
    canSettle:
      canSettleResult.status === 'success' ? canSettleResult.result : false,
  };
}
