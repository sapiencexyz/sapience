import { elizaLogger } from "@elizaos/core";
import { encodeAbiParameters } from "viem";

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
 * Encode trade outcomes for UMA resolver
 */
export async function encodeTradeOutcomes(markets: any[], predictions: any[]): Promise<string[]> {
  try {
    const outcomes = markets.map((market, index) => {
      const prediction = predictions[index];
      return {
        marketId: market.id,
        prediction: prediction.probability > 50,
      };
    });

    const normalized = outcomes.map((o) => ({
      marketId: (o.marketId.startsWith('0x')
        ? o.marketId
        : `0x${o.marketId}`) as `0x${string}`,
      prediction: !!o.prediction,
    }));

    const encoded = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'marketId', type: 'bytes32' },
            { name: 'prediction', type: 'bool' },
          ],
        },
      ],
      [normalized]
    );

    elizaLogger.info(`[Trading] Encoded ${outcomes.length} predicted outcomes`);
    return [encoded];
  } catch (error) {
    elizaLogger.error("[Trading] Failed to encode predicted outcomes:", error);
    return predictions.map(p => `0x${p.probability > 50 ? '01' : '00'}`);
  }
}

/**
 * Select the best bid from a list of bids
 */
export function selectBestBid(bids: Bid[]): Bid {
  const now = Date.now() / 1000;
  const validBids = bids.filter((bid) => bid.makerDeadline > now);
  
  if (validBids.length === 0) {
    throw new Error("No valid bids available");
  }

  const sortedBids = validBids.sort((a, b) => {
    const sizeA = parseFloat(a.makerWager || '0');
    const sizeB = parseFloat(b.makerWager || '0');
    return sizeB - sizeA;
  });

  return sortedBids[0];
}

/**
 * Format position size for display
 */
export function formatPositionSize(amount: string): string {
  return `${parseFloat(amount) / 1e18} USDe`;
}

