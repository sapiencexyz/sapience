import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Chain,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { predictionMarket } from '../contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '../constants/chain';

type Hex = `0x${string}`;

// Ethereal chain definition (trading chain)
const tradingChain: Chain = {
  id: CHAIN_ID_ETHEREAL,
  name: 'Ethereal',
  nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
  blockExplorers: {
    default: { name: 'Ethereal Explorer', url: 'https://explorer.ethereal.trade' },
  },
};

// Default trading RPC URL
const TRADING_RPC_URL = 'https://rpc.ethereal.trade';

// PredictionMarket ABI for burn function
const PREDICTION_MARKET_ABI = parseAbi([
  'function burn(uint256 tokenId, bytes32 refCode)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getPrediction(uint256 tokenId) view returns ((uint256 predictionId, uint256 makerNftTokenId, uint256 takerNftTokenId, uint256 makerCollateral, uint256 takerCollateral, bytes encodedPredictedOutcomes, address resolver, address maker, address taker, bool settled, bool makerWon))',
]);

/**
 * Condition data from the API
 */
export interface ConditionInfo {
  id: string;
  question: string | null;
  shortName: string | null;
  endTime: number | null;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
}

/**
 * Prediction data within a position
 */
export interface PredictionInfo {
  conditionId: string;
  outcomeYes: boolean;
  chainId: number | null;
  condition: ConditionInfo | null;
}

/**
 * Position data returned from GraphQL query
 *
 * Key insight: A position is claimable when:
 * - status is 'active' (not yet burned/claimed)
 * - ALL linked conditions are settled
 *
 * The winner is determined by comparing prediction.outcomeYes with condition.resolvedToYes
 */
export interface ClaimablePosition {
  id: number;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorNftTokenId: string;
  counterpartyNftTokenId: string;
  totalCollateral: string;
  predictorCollateral: string | null;
  counterpartyCollateral: string | null;
  refCode: string | null;
  status: 'active' | 'settled' | 'consolidated';
  predictorWon: boolean | null;
  settledAt: number | null;
  predictions: PredictionInfo[];
}

/**
 * GraphQL query for fetching ACTIVE positions (not yet claimed)
 * These positions may have settled conditions and be ready to claim
 */
export const CLAIMABLE_POSITIONS_QUERY = `
  query ClaimablePositions($address: String!, $chainId: Int, $take: Int, $skip: Int) {
    positions(
      address: $address
      chainId: $chainId
      status: "active"
      take: $take
      skip: $skip
    ) {
      id
      chainId
      marketAddress
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      totalCollateral
      predictorCollateral
      counterpartyCollateral
      refCode
      status
      predictorWon
      settledAt
      predictions {
        conditionId
        outcomeYes
        chainId
        condition {
          id
          question
          shortName
          endTime
          resolver
          settled
          resolvedToYes
        }
      }
    }
  }
`;

/**
 * Check if ALL conditions in a position are settled
 */
export function areAllConditionsSettled(position: ClaimablePosition): boolean {
  if (!position.predictions || position.predictions.length === 0) {
    return false;
  }

  return position.predictions.every(
    (pred) => pred.condition && pred.condition.settled === true
  );
}

/**
 * Determine if the predictor (maker) won based on prediction outcomes vs condition resolutions
 *
 * For a parlay (multi-leg) position:
 * - Predictor wins if ALL their predictions match the resolved outcomes
 * - Otherwise counterparty wins
 */
export function didPredictorWin(position: ClaimablePosition): boolean {
  if (!position.predictions || position.predictions.length === 0) {
    return false;
  }

  // Predictor wins if all their predicted outcomes match the resolved outcomes
  return position.predictions.every((pred) => {
    if (!pred.condition || !pred.condition.settled) {
      return false; // Can't determine yet
    }
    // predictor bet on outcomeYes, condition resolved to resolvedToYes
    return pred.outcomeYes === pred.condition.resolvedToYes;
  });
}

/**
 * Determine if a position is claimable by the given address and return claim info
 *
 * A position is claimable when:
 * 1. Position status is 'active' (not yet burned)
 * 2. All linked conditions are settled
 * 3. The wallet is either predictor or counterparty
 */
export function getClaimableTokenId(
  position: ClaimablePosition,
  walletAddress: string
): { tokenId: string; isWinner: boolean; winnings: bigint; marketName: string } | null {
  const addr = walletAddress.toLowerCase();
  const isPredictor = position.predictor.toLowerCase() === addr;
  const isCounterparty = position.counterparty.toLowerCase() === addr;

  if (!isPredictor && !isCounterparty) {
    return null; // Not a participant
  }

  // Position must be active (not yet claimed)
  if (position.status !== 'active') {
    return null;
  }

  // All conditions must be settled
  if (!areAllConditionsSettled(position)) {
    return null;
  }

  // Determine winner based on prediction outcomes vs condition resolutions
  const predictorWon = didPredictorWin(position);
  const isWinner = (isPredictor && predictorWon) || (isCounterparty && !predictorWon);

  // Calculate winnings
  const totalCollateral = BigInt(position.totalCollateral);
  const userCollateral = isPredictor
    ? BigInt(position.predictorCollateral || '0')
    : BigInt(position.counterpartyCollateral || '0');

  // Winner gets total collateral minus their own stake (net profit)
  // But they also get their stake back, so total payout = totalCollateral
  const winnings = isWinner ? totalCollateral - userCollateral : BigInt(0);

  // Return the token ID for the user's side
  const tokenId = isPredictor
    ? position.predictorNftTokenId
    : position.counterpartyNftTokenId;

  // Get market name from first prediction
  const marketName =
    position.predictions?.[0]?.condition?.shortName ||
    position.predictions?.[0]?.condition?.question?.slice(0, 50) ||
    `Position #${position.id}`;

  return { tokenId, isWinner, winnings, marketName };
}

/**
 * Filter positions to only those that are claimable (conditions settled, position active)
 * and where the wallet is a winner
 */
export function filterWinningPositions(
  positions: ClaimablePosition[],
  walletAddress: string
): Array<ClaimablePosition & { tokenId: string; winnings: bigint; marketName: string }> {
  const results: Array<ClaimablePosition & { tokenId: string; winnings: bigint; marketName: string }> = [];

  for (const position of positions) {
    const claim = getClaimableTokenId(position, walletAddress);
    if (claim && claim.isWinner && claim.winnings > BigInt(0)) {
      results.push({
        ...position,
        tokenId: claim.tokenId,
        winnings: claim.winnings,
        marketName: claim.marketName,
      });
    }
  }

  return results;
}

/**
 * Filter positions that are ready to claim (conditions settled) regardless of winner
 */
export function filterClaimablePositions(
  positions: ClaimablePosition[],
  walletAddress: string
): Array<ClaimablePosition & { tokenId: string; isWinner: boolean; winnings: bigint; marketName: string }> {
  const results: Array<ClaimablePosition & { tokenId: string; isWinner: boolean; winnings: bigint; marketName: string }> = [];

  for (const position of positions) {
    const claim = getClaimableTokenId(position, walletAddress);
    if (claim) {
      results.push({
        ...position,
        tokenId: claim.tokenId,
        isWinner: claim.isWinner,
        winnings: claim.winnings,
        marketName: claim.marketName,
      });
    }
  }

  return results;
}

/**
 * Create a public client for the trading chain
 */
function createClaimPublicClient(rpcUrl?: string): PublicClient<Transport, Chain> {
  return createPublicClient({
    chain: tradingChain,
    transport: http(rpcUrl || TRADING_RPC_URL),
  });
}

/**
 * Create a wallet client for the trading chain
 */
function createClaimWalletClient(
  privateKey: Hex,
  rpcUrl?: string
): WalletClient<Transport, Chain, Account> {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: tradingChain,
    transport: http(rpcUrl || TRADING_RPC_URL),
  });
}

/**
 * Check if the caller owns the NFT token
 */
export async function isTokenOwner(args: {
  tokenId: bigint;
  walletAddress: Hex;
  marketAddress?: Hex;
  rpcUrl?: string;
}): Promise<boolean> {
  const { tokenId, walletAddress, rpcUrl } = args;
  const marketAddr = args.marketAddress || (predictionMarket[CHAIN_ID_ETHEREAL]?.address as Hex);

  if (!marketAddr) {
    throw new Error('No PredictionMarket address found for Ethereal chain');
  }

  const publicClient = createClaimPublicClient(rpcUrl);

  try {
    const owner = await publicClient.readContract({
      address: marketAddr,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    });

    return (owner as string).toLowerCase() === walletAddress.toLowerCase();
  } catch {
    // Token may not exist or be already burned
    return false;
  }
}

/**
 * Claim winnings by burning a settled position NFT
 *
 * @param args.privateKey - The private key to sign the transaction
 * @param args.tokenId - The NFT token ID to burn (from position.predictorNftTokenId or counterpartyNftTokenId)
 * @param args.refCode - Optional referral code (defaults to zero bytes32)
 * @param args.marketAddress - Optional PredictionMarket contract address
 * @param args.rpcUrl - Optional RPC URL
 * @returns Transaction hash
 */
export async function claimWinnings(args: {
  privateKey: Hex;
  tokenId: bigint;
  refCode?: Hex;
  marketAddress?: Hex;
  rpcUrl?: string;
}): Promise<{ hash: Hex }> {
  const { privateKey, tokenId, rpcUrl } = args;
  const refCode = args.refCode || ('0x' + '0'.repeat(64)) as Hex;
  const marketAddr = args.marketAddress || (predictionMarket[CHAIN_ID_ETHEREAL]?.address as Hex);

  if (!marketAddr) {
    throw new Error('No PredictionMarket address found for Ethereal chain');
  }

  const walletClient = createClaimWalletClient(privateKey, rpcUrl);
  const publicClient = createClaimPublicClient(rpcUrl);

  // Encode the burn function call
  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: 'burn',
    args: [tokenId, refCode],
  });

  // Send transaction
  const hash = await walletClient.sendTransaction({
    to: marketAddr,
    data,
    value: BigInt(0),
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });

  return { hash };
}

/**
 * Claim winnings for multiple positions
 *
 * @param args.privateKey - The private key to sign the transactions
 * @param args.tokenIds - Array of NFT token IDs to burn
 * @param args.refCode - Optional referral code (defaults to zero bytes32)
 * @param args.marketAddress - Optional PredictionMarket contract address
 * @param args.rpcUrl - Optional RPC URL
 * @returns Array of transaction hashes
 */
export async function claimMultipleWinnings(args: {
  privateKey: Hex;
  tokenIds: bigint[];
  refCode?: Hex;
  marketAddress?: Hex;
  rpcUrl?: string;
}): Promise<{ hashes: Hex[]; errors: Array<{ tokenId: bigint; error: string }> }> {
  const { privateKey, tokenIds, refCode, marketAddress, rpcUrl } = args;

  const hashes: Hex[] = [];
  const errors: Array<{ tokenId: bigint; error: string }> = [];

  for (const tokenId of tokenIds) {
    try {
      const { hash } = await claimWinnings({
        privateKey,
        tokenId,
        refCode,
        marketAddress,
        rpcUrl,
      });
      hashes.push(hash);
    } catch (error: any) {
      errors.push({ tokenId, error: error.message });
    }
  }

  return { hashes, errors };
}
