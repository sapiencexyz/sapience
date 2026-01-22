import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { formatEther } from "viem";
import {
  getPrivateKey,
  getWalletAddress,
  getTradingRpcUrl,
  getTradingContractAddresses,
  getApiEndpoints,
  CHAIN_ID_ETHEREAL,
} from "../utils/blockchain.js";

/**
 * Simple GraphQL request helper using fetch
 */
async function graphqlRequest<T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors[0]?.message || "Unknown error"}`);
  }

  return json.data as T;
}

/**
 * GraphQL query for fetching ACTIVE positions (not yet claimed)
 * These positions may have settled conditions and be ready to claim
 */
const CLAIMABLE_POSITIONS_QUERY = `
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

interface ConditionInfo {
  id: string;
  question: string | null;
  shortName: string | null;
  endTime: number | null;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
}

interface PredictionInfo {
  conditionId: string;
  outcomeYes: boolean;
  chainId: number | null;
  condition: ConditionInfo | null;
}

interface ClaimablePosition {
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
  status: string;
  predictorWon: boolean | null;
  settledAt: number | null;
  predictions: PredictionInfo[];
}

interface PositionsResponse {
  positions: ClaimablePosition[];
}

/**
 * Check if ALL conditions in a position are settled
 */
function areAllConditionsSettled(position: ClaimablePosition): boolean {
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
function didPredictorWin(position: ClaimablePosition): boolean {
  if (!position.predictions || position.predictions.length === 0) {
    return false;
  }

  // Predictor wins if all their predicted outcomes match the resolved outcomes
  return position.predictions.every((pred) => {
    if (!pred.condition || !pred.condition.settled) {
      return false;
    }
    return pred.outcomeYes === pred.condition.resolvedToYes;
  });
}

/**
 * Get the claimable token ID and winnings for a position
 *
 * A position is claimable when:
 * 1. Position status is 'active' (not yet burned)
 * 2. All linked conditions are settled
 * 3. The wallet is either predictor or counterparty
 */
function getClaimableInfo(
  position: ClaimablePosition,
  walletAddress: string
): { tokenId: string; isWinner: boolean; winnings: bigint; marketName: string } | null {
  const addr = walletAddress.toLowerCase();
  const isPredictor = position.predictor.toLowerCase() === addr;
  const isCounterparty = position.counterparty.toLowerCase() === addr;

  if (!isPredictor && !isCounterparty) {
    return null;
  }

  // Position must be active (not yet claimed)
  if (position.status !== "active") {
    return null;
  }

  // All conditions must be settled
  if (!areAllConditionsSettled(position)) {
    return null;
  }

  // Determine winner based on prediction outcomes vs condition resolutions
  const predictorWon = didPredictorWin(position);
  const isWinner = (isPredictor && predictorWon) || (isCounterparty && !predictorWon);

  const totalCollateral = BigInt(position.totalCollateral);
  const userCollateral = isPredictor
    ? BigInt(position.predictorCollateral || "0")
    : BigInt(position.counterpartyCollateral || "0");

  // Winner's net profit = totalCollateral - their stake
  const winnings = isWinner ? totalCollateral - userCollateral : BigInt(0);

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

export const claimWinningsAction: Action = {
  name: "CLAIM_WINNINGS",
  similes: [
    "claim winnings",
    "claim my winnings",
    "redeem winnings",
    "collect winnings",
    "cash out",
    "claim profits",
    "redeem profits",
    "claim rewards",
    "collect rewards",
    "withdraw winnings",
  ],
  description:
    "Claim winnings from prediction market positions where conditions have settled. Queries for active positions with settled conditions and burns the NFTs to receive collateral.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || "";
    return (
      (text.includes("claim") || text.includes("redeem") || text.includes("collect") || text.includes("withdraw")) &&
      (text.includes("winning") || text.includes("profit") || text.includes("reward"))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      elizaLogger.info("[ClaimWinnings] Starting claim winnings action");

      // Get wallet address
      const walletAddress = getWalletAddress();
      const privateKey = getPrivateKey();
      const rpcUrl = getTradingRpcUrl();
      const { PREDICTION_MARKET } = getTradingContractAddresses();
      const { sapienceGraphql } = getApiEndpoints();

      elizaLogger.info(`[ClaimWinnings] Wallet: ${walletAddress}`);
      elizaLogger.info(`[ClaimWinnings] GraphQL endpoint: ${sapienceGraphql}`);

      // Query for ACTIVE positions (not yet claimed)
      const response = await graphqlRequest<PositionsResponse>(
        sapienceGraphql,
        CLAIMABLE_POSITIONS_QUERY,
        {
          address: walletAddress,
          chainId: CHAIN_ID_ETHEREAL,
          take: 100,
          skip: 0,
        }
      );

      const positions = response.positions || [];
      elizaLogger.info(`[ClaimWinnings] Found ${positions.length} active positions`);

      if (positions.length === 0) {
        await callback?.({
          text: "No active positions found. You don't have any positions to check for claimable winnings.",
          content: {
            success: true,
            action: "CLAIM_WINNINGS",
            claimableCount: 0,
            totalWinnings: "0",
          },
        });
        return;
      }

      // Filter to positions where all conditions are settled
      const claimablePositions: Array<{
        position: ClaimablePosition;
        tokenId: string;
        isWinner: boolean;
        winnings: bigint;
        marketName: string;
      }> = [];

      for (const position of positions) {
        const info = getClaimableInfo(position, walletAddress);
        if (info) {
          claimablePositions.push({
            position,
            tokenId: info.tokenId,
            isWinner: info.isWinner,
            winnings: info.winnings,
            marketName: info.marketName,
          });
        }
      }

      elizaLogger.info(
        `[ClaimWinnings] Found ${claimablePositions.length} positions with settled conditions`
      );

      if (claimablePositions.length === 0) {
        await callback?.({
          text: `Found ${positions.length} active positions but none have all conditions settled yet. Positions can only be claimed once all their market conditions have resolved.`,
          content: {
            success: true,
            action: "CLAIM_WINNINGS",
            activePositions: positions.length,
            claimableCount: 0,
            totalWinnings: "0",
          },
        });
        return;
      }

      // Separate winners and losers
      const winningPositions = claimablePositions.filter((p) => p.isWinner);
      const losingPositions = claimablePositions.filter((p) => !p.isWinner);

      elizaLogger.info(
        `[ClaimWinnings] ${winningPositions.length} winning, ${losingPositions.length} losing positions`
      );

      if (winningPositions.length === 0) {
        const lossSummary = losingPositions
          .map((p) => `- ${p.marketName}`)
          .join("\n");
        await callback?.({
          text: `Found ${claimablePositions.length} claimable position(s) but none are winners. Your losing positions:\n${lossSummary}\n\nNo winnings to claim.`,
          content: {
            success: true,
            action: "CLAIM_WINNINGS",
            claimableCount: claimablePositions.length,
            winningCount: 0,
            losingCount: losingPositions.length,
            totalWinnings: "0",
          },
        });
        return;
      }

      // Calculate total winnings
      const totalWinnings = winningPositions.reduce(
        (sum, p) => sum + p.winnings,
        BigInt(0)
      );

      // Load SDK for transaction submission
      const { submitTransaction } = await import("../utils/sdk.js").then((m) => m.loadSdk());
      const { encodeFunctionData, parseAbi } = await import("viem");

      const BURN_ABI = parseAbi([
        "function burn(uint256 tokenId, bytes32 refCode)",
      ]);

      const zeroRefCode = ("0x" + "0".repeat(64)) as `0x${string}`;

      // Claim each winning position
      const results: Array<{
        tokenId: string;
        marketName: string;
        winnings: string;
        txHash?: string;
        error?: string;
      }> = [];

      for (const { tokenId, winnings, marketName, position } of winningPositions) {
        try {
          elizaLogger.info(
            `[ClaimWinnings] Claiming position tokenId=${tokenId}, winnings=${formatEther(winnings)} USDe`
          );

          const refCode = position.refCode
            ? (position.refCode as `0x${string}`)
            : zeroRefCode;

          const data = encodeFunctionData({
            abi: BURN_ABI,
            functionName: "burn",
            args: [BigInt(tokenId), refCode],
          });

          const tx = await submitTransaction({
            rpc: rpcUrl,
            chainId: CHAIN_ID_ETHEREAL,
            privateKey,
            tx: {
              to: PREDICTION_MARKET,
              data,
              value: "0",
            },
          });

          elizaLogger.info(`[ClaimWinnings] Claimed tokenId=${tokenId}, tx=${tx.hash}`);
          results.push({
            tokenId,
            marketName,
            winnings: formatEther(winnings),
            txHash: tx.hash,
          });
        } catch (error: any) {
          elizaLogger.error(
            `[ClaimWinnings] Failed to claim tokenId=${tokenId}:`,
            error
          );
          results.push({
            tokenId,
            marketName,
            winnings: formatEther(winnings),
            error: error.message,
          });
        }
      }

      // Build response
      const successfulClaims = results.filter((r) => r.txHash);
      const failedClaims = results.filter((r) => r.error);

      let responseText: string;
      if (successfulClaims.length > 0 && failedClaims.length === 0) {
        const claimsSummary = successfulClaims
          .map((r) => `- ${r.marketName}: +${r.winnings} USDe (TX: ${r.txHash})`)
          .join("\n");
        responseText = `**Winnings Claimed Successfully!**

Claimed ${successfulClaims.length} position(s):
${claimsSummary}

**Total Profit: ${formatEther(totalWinnings)} USDe**`;
      } else if (successfulClaims.length > 0 && failedClaims.length > 0) {
        const successSummary = successfulClaims
          .map((r) => `- ${r.marketName}: +${r.winnings} USDe`)
          .join("\n");
        const failedSummary = failedClaims
          .map((r) => `- ${r.marketName}: ${r.error}`)
          .join("\n");
        responseText = `**Partial Success**

Claimed ${successfulClaims.length} position(s):
${successSummary}

Failed to claim ${failedClaims.length} position(s):
${failedSummary}`;
      } else {
        const failedSummary = failedClaims
          .map((r) => `- ${r.marketName}: ${r.error}`)
          .join("\n");
        responseText = `**Failed to Claim Winnings**

All ${failedClaims.length} claim(s) failed:
${failedSummary}`;
      }

      await callback?.({
        text: responseText,
        content: {
          success: successfulClaims.length > 0,
          action: "CLAIM_WINNINGS",
          claimableCount: claimablePositions.length,
          winningCount: winningPositions.length,
          losingCount: losingPositions.length,
          successfulClaims: successfulClaims.length,
          failedClaims: failedClaims.length,
          totalWinnings: formatEther(totalWinnings),
          results,
        },
      });
    } catch (error: any) {
      elizaLogger.error("[ClaimWinnings] Action failed:", error);
      await callback?.({
        text: `Failed to claim winnings: ${error.message}`,
        content: {
          success: false,
          action: "CLAIM_WINNINGS",
          error: error.message,
        },
      });
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "claim my winnings" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "**Winnings Claimed Successfully!**\n\nClaimed 2 position(s):\n- BTC > 100k by Dec: +1.5 USDe\n- ETH > 5k by Q1: +0.8 USDe\n\n**Total Profit: 2.3 USDe**",
          action: "CLAIM_WINNINGS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "redeem my profits from predictions" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Found 3 active positions but none have all conditions settled yet. Positions can only be claimed once all their market conditions have resolved.",
          action: "CLAIM_WINNINGS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "collect my rewards" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "**Winnings Claimed Successfully!**\n\nClaimed 1 position(s):\n- Fed rate cut Q1: +2.0 USDe\n\n**Total Profit: 2.0 USDe**",
          action: "CLAIM_WINNINGS",
        },
      },
    ],
  ],
};

export default claimWinningsAction;
