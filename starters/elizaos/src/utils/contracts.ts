import { elizaLogger } from "@elizaos/core";
import { 
  createEtherealPublicClient, 
  createEtherealWalletClient, 
  getTradingContractAddresses, 
  getTradingConfig,
  getTradingRpcUrl
} from "./blockchain.js";
import { loadSdk } from "./sdk.js";

interface Bid {
  auctionId: string;
  maker: string;
  makerWager: string;
  makerDeadline: number;
  makerSignature: string;
  makerNonce: number;
  taker: string;
  takerCollateral: string;
  wager?: string; // fallback for legacy compatibility
  resolver: string;
  encodedPredictedOutcomes: string;
  predictedOutcomes: string[];
}

/**
 * Get the current maker nonce from the PredictionMarket contract on Ethereal
 */
export async function getCurrentMakerNonce(walletAddress: string, rpcUrl?: string): Promise<number> {
  try {
    const publicClient = await createEtherealPublicClient(rpcUrl);
    const { PREDICTION_MARKET } = getTradingContractAddresses();
    
    const nonce = await publicClient.readContract({
      address: PREDICTION_MARKET,
      abi: [{
        name: "nonces",
        type: "function",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
      }],
      functionName: 'nonces',
      args: [walletAddress as `0x${string}`],
    }) as bigint;

    return Number(nonce);
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to get maker nonce:", error);
    return 0;
  }
}

/**
 * Prepare for trading by wrapping USDe to WUSDe and approving for the PredictionMarket.
 * 
 * This follows the same pattern as the frontend create position form:
 * 1. Always wrap the full collateral amount (no balance optimization)
 * 2. Check allowance and approve only if insufficient
 * 3. Execute transactions sequentially, waiting for each to confirm
 * 
 * On Ethereal chain, the native token is USDe but contracts expect WUSDe (Wrapped USDe) as collateral.
 */
export async function ensureTokenApproval({
  privateKey,
  rpcUrl,
  amount,
}: {
  privateKey: `0x${string}`;
  rpcUrl?: string;
  amount: string;
}): Promise<void> {
  try {
    const sdk = await loadSdk();
    const { PREDICTION_MARKET } = getTradingContractAddresses();
    const requiredAmount = BigInt(amount);
    
    elizaLogger.info(`[Contracts] Preparing for trade...`);
    elizaLogger.info(`[Contracts] Required collateral: ${requiredAmount}`);
    
    // Use SDK's prepareForTrade which handles wrapping and approval sequentially
    if (!sdk.prepareForTrade) {
      throw new Error("SDK prepareForTrade function not available");
    }

    const result = await sdk.prepareForTrade({
      privateKey,
      collateralAmount: requiredAmount,
      spender: PREDICTION_MARKET,
      rpcUrl: rpcUrl || getTradingRpcUrl(),
    });
    
    if (result.wrapTxHash) {
      elizaLogger.info(`[Contracts] Wrapped USDe -> WUSDe, tx: ${result.wrapTxHash}`);
    }
    if (result.approvalTxHash) {
      elizaLogger.info(`[Contracts] Approved WUSDe, tx: ${result.approvalTxHash}`);
    }
    elizaLogger.info(`[Contracts] Ready for trade. WUSDe balance: ${result.wusdBalance}`);
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to prepare for trading:", error);
    throw error;
  }
}

/**
 * Build mint transaction calldata for PredictionMarket contract on Ethereal
 * 
 * Role mapping:
 * - Requester = auction creator (agent) = calls mint = contract "maker"
 * - Responder = bidder = signs the bid = contract "taker"
 * 
 * The contract requires msg.sender == maker, so the requester must be "maker"
 */
export async function buildMintCalldata({
  bid,
  requester,
  requesterNonce,
}: {
  bid: Bid;
  requester: string;
  requesterNonce: bigint;
}): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const { RESOLVER } = getTradingContractAddresses();
  
  // Requester (auction creator) = contract "maker" (msg.sender)
  // Responder (bidder) = contract "taker" (provides signature)
  const mintRequest = {
    encodedPredictedOutcomes: bid.encodedPredictedOutcomes || "0x",
    resolver: bid.resolver || RESOLVER,
    makerCollateral: BigInt(bid.takerCollateral || bid.wager || '0'), // Requester's stake
    takerCollateral: BigInt(bid.makerWager || '0'), // Responder's stake
    maker: requester, // Requester - must match msg.sender
    taker: bid.maker, // Responder (bidder address from API)
    makerNonce: requesterNonce, // Requester's nonce from contract
    takerSignature: bid.makerSignature || "0x", // Responder's signature
    takerDeadline: BigInt(bid.makerDeadline || 0), // Responder's deadline
    refCode: "0x0000000000000000000000000000000000000000000000000000000000000000"
  };
  
  return encodeFunctionData({
    abi: [{
      name: "mint",
      type: "function", 
      inputs: [
        { name: "mintPredictionRequestData", type: "tuple", components: [
          { name: "encodedPredictedOutcomes", type: "bytes" },
          { name: "resolver", type: "address" },
          { name: "makerCollateral", type: "uint256" },
          { name: "takerCollateral", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "taker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerSignature", type: "bytes" },
          { name: "takerDeadline", type: "uint256" },
          { name: "refCode", type: "bytes32" },
        ]},
      ],
      outputs: [
        { name: "makerNftTokenId", type: "uint256" },
        { name: "takerNftTokenId", type: "uint256" }
      ],
    }],
    functionName: "mint",
    args: [mintRequest],
  });
}
