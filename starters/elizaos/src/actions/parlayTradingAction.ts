import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { 
  getPrivateKey, 
  getWalletAddress, 
  getRpcUrl, 
  getTradingConfig, 
  getApiEndpoints, 
  getContractAddresses 
} from "../utils/blockchain.js";
import { 
  getCurrentMakerNonce, 
  ensureTokenApproval, 
  buildMintCalldata 
} from "../utils/contracts.js";
import { 
  encodeParlayOutcomes, 
  selectBestBid, 
  formatWagerAmount 
} from "../utils/parlay.js";

interface Bid {
  auctionId: string;
  taker: string;
  takerWager: string;
  takerDeadline: number;
  takerSignature: string;
  maker: string;
  makerCollateral: string;
  wager?: string; // fallback for legacy compatibility
  resolver: string;
  encodedPredictedOutcomes: string;
  predictedOutcomes: string[];
  makerNonce: number;
}

export const parlayTradingAction: Action = {
  name: "PARLAY_TRADING",
  description: "Start parlay auction with 3+ legs and accept best bid from takers",
  similes: ["trade parlay", "make parlay", "start auction", "bet parlay"],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      // Check if trading is enabled via environment variable
      const tradingEnabled = process.env.ENABLE_PARLAY_TRADING === "true";
      if (!tradingEnabled) {
        elizaLogger.info("[ParlayTrading] Trading disabled via ENABLE_PARLAY_TRADING env var");
        await callback?.({
          text: "Parlay trading is disabled. Set ENABLE_PARLAY_TRADING=true to enable.",
          content: {},
        });
        return;
      }

      // Parse parlay data from message - expect multiple market predictions
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide parlay data: {"markets": [...], "predictions": [...]}',
          content: {},
        });
        return;
      }

      const data = JSON.parse(jsonMatch[0]) as {
        markets: any[];
        predictions: {
          probability: number;
          reasoning: string;
          confidence: number;
          market: string;
        }[];
      };

      const { markets, predictions } = data;

      // Validate we have at least 3 legs for parlay
      if (!markets || !predictions || markets.length < 3 || predictions.length < 3) {
        await callback?.({
          text: "Parlay requires at least 3 market predictions",
          content: {},
        });
        return;
      }

      // Get wallet details
      const privateKey = getPrivateKey();
      const walletAddress = getWalletAddress();
      const rpcUrl = getRpcUrl();
      const { wagerAmount } = getTradingConfig();

      elizaLogger.info(`[ParlayTrading] Starting parlay auction with ${markets.length} legs`);

      // Start auction as maker
      const auctionResult = await startParlayAuction({
        markets,
        predictions,
        walletAddress,
        wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[ParlayTrading] Parlay trade executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `Parlay executed: ${markets.length} legs, wager ${formatWagerAmount(wagerAmount)} (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            legs: markets.length,
            predictions: predictions.map(p => ({ market: p.market, probability: p.probability })),
            txHash: auctionResult.txHash,
          },
        });
      } else {
        throw new Error(auctionResult.error || "Parlay auction failed");
      }
    } catch (err: any) {
      elizaLogger.error("[ParlayTrading] Trading failed:", err);
      await callback?.({
        text: `Trading failed: ${err?.message}`,
        content: { success: false, error: err?.message },
      });
    }
  },
};

async function startParlayAuction({
  markets,
  predictions,
  walletAddress,
  wagerAmount,
  rpcUrl,
}: {
  markets: any[];
  predictions: any[];
  walletAddress: string;
  wagerAmount: string;
  rpcUrl: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      // Connect to Sapience WebSocket as a maker
      const { sapienceWs } = getApiEndpoints();
      const socket = new WebSocket(sapienceWs);

      let timeoutId: NodeJS.Timeout;
      let resolved = false;
      let auctionId: string | null = null;
      let keepAliveInterval: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      let resolveOnce = (result: { success: boolean; txHash?: string; error?: string }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      const { auctionTimeoutMs, keepAliveMs } = getTradingConfig();
      timeoutId = setTimeout(() => {
        elizaLogger.info(`[ParlayTrading] Auction timeout after ${auctionTimeoutMs/1000}s for auction ${auctionId}. No bids received.`);
        console.log(`⏰ Parlay auction timeout: No takers found for our ${markets.length}-leg parlay after ${auctionTimeoutMs/1000}s.`);
        resolveOnce({ success: false, error: "No bids received within timeout" });
      }, auctionTimeoutMs);

      const startKeepAlive = () => {
        keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, keepAliveMs);
      };

      socket.onopen = async () => {
        elizaLogger.info("[ParlayTrading] Connected to auction WebSocket as MAKER");
        startKeepAlive();

        const contractNonce = await getCurrentMakerNonce(walletAddress as `0x${string}`, rpcUrl);
        elizaLogger.info(`[ParlayTrading] Using contract maker nonce: ${contractNonce}`);

        const { UMA_RESOLVER } = getContractAddresses();
        const predictedOutcomes = await encodeParlayOutcomes(markets, predictions);

        const chainId = parseInt(process.env.CHAIN_ID || "42161");

        const auctionMessage = {
          type: "auction.start",
          payload: {
            maker: walletAddress,
            wager: wagerAmount,
            resolver: UMA_RESOLVER,
            predictedOutcomes,
            makerNonce: contractNonce,
            chainId: chainId,
          },
        };

        elizaLogger.info(`[ParlayTrading] Starting parlay auction: ${JSON.stringify(auctionMessage)}`);
        socket.send(JSON.stringify(auctionMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[ParlayTrading] Received message type: ${message.type}`);
          
          if (message.type === "auction.bids") {
            elizaLogger.info(`[ParlayTrading] Bid message payload keys: ${Object.keys(message.payload || {})}`);
          } else {
            elizaLogger.info(`[ParlayTrading] Full message: ${JSON.stringify(message)}`);
          }

          if (message.type === "auction.ack") {
            auctionId = message.payload?.auctionId;
            elizaLogger.info(`[ParlayTrading] Auction acknowledged with ID: ${auctionId}`);
            
            if (auctionId) {
              socket.send(JSON.stringify({
                type: "auction.subscribe",
                payload: { auctionId }
              }));
              elizaLogger.info(`[ParlayTrading] Subscribed to auction bids for ${auctionId}`);
              console.log(`🎯 Parlay auction live! Waiting for takers to bid on our ${markets.length}-leg parlay (Auction ID: ${auctionId})`);
              
              const { statusIntervalMs } = getTradingConfig();
              const statusInterval = setInterval(() => {
                elizaLogger.info(`[ParlayTrading] Still waiting for bids on auction ${auctionId}...`);
              }, statusIntervalMs);
              
              const originalResolve = resolveOnce;
              const enhancedResolve = (result: { success: boolean; txHash?: string; error?: string }) => {
                clearInterval(statusInterval);
                originalResolve(result);
              };
              resolveOnce = enhancedResolve;
            }
          } else if (message.type === "auction.bids") {
            const allBids = message.payload?.bids || [];
            elizaLogger.info(`[ParlayTrading] Received ${allBids.length} total bids`);
            
            const ourBids = allBids.filter((bid: Bid) => bid?.auctionId === auctionId);
            elizaLogger.info(`[ParlayTrading] Found ${ourBids.length} bids for our auction ${auctionId}`);

            if (ourBids.length > 0) {
              const bestBid = selectBestBid(ourBids);
              elizaLogger.info(`[ParlayTrading] Selected best bid: ${JSON.stringify(bestBid)}`);

              const privateKey = getPrivateKey();
              
              const txHash = await acceptBid({
                bid: bestBid,
                privateKey,
                rpcUrl,
              });

              resolveOnce({ success: true, txHash });
            }
          } else if (message.type === "auction.error") {
            elizaLogger.error("[ParlayTrading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          } else {
            elizaLogger.info(`[ParlayTrading] Unhandled message type: ${message.type}`);
          }
        } catch (error: any) {
          elizaLogger.error("[ParlayTrading] Error processing message:", error);
          resolveOnce({ success: false, error: error.message });
        }
      };

      socket.onerror = (error: any) => {
        elizaLogger.error("[ParlayTrading] WebSocket error:", error);
        resolveOnce({ success: false, error: "WebSocket error" });
      };

      socket.onclose = (event) => {
        elizaLogger.info(`[ParlayTrading] WebSocket closed: ${event.code} ${event.reason}`);
        if (!resolved) {
          if (event.code === 1006) {
            elizaLogger.warn("[ParlayTrading] Connection closed abnormally - server may not be available");
            resolveOnce({ success: false, error: "Auction service not available" });
          } else {
            resolveOnce({ success: false, error: "WebSocket disconnected" });
          }
        }
      };
    } catch (error: any) {
      resolve({ success: false, error: error.message });
    }
  });
}


async function acceptBid({
  bid,
  privateKey,
  rpcUrl,
}: {
  bid: Bid;
  privateKey: string;
  rpcUrl: string;
}): Promise<string> {
  try {
    const { submitTransaction } = await loadSdk();

    const { getWalletAddress } = await import("../utils/blockchain.js");
    const makerAddress = getWalletAddress();
    
    const mintCalldata = await buildMintCalldata({
      bid,
      maker: makerAddress,
    });

    const { PREDICTION_MARKET } = getContractAddresses();
    
    const currentMakerNonce = await getCurrentMakerNonce(makerAddress, rpcUrl);
    elizaLogger.info(`[ParlayTrading] Contract maker nonce: ${currentMakerNonce}, Bid maker nonce: ${bid.makerNonce}`);
    
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: bid.makerCollateral || bid.wager || '0',
    });

    elizaLogger.info("[ParlayTrading] Executing parlay mint transaction...");
    elizaLogger.info(`[ParlayTrading] Mint details - Maker: ${bid.maker}, Taker: ${bid.taker}`);
    elizaLogger.info(`[ParlayTrading] Collateral - Maker: ${bid.makerCollateral}, Taker: ${bid.takerWager}`);
    elizaLogger.info(`[ParlayTrading] Maker nonce: ${bid.makerNonce}`);
    
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: PREDICTION_MARKET,
        data: mintCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[ParlayTrading] Parlay TX: ${mintTx.hash}`);
    return mintTx.hash;
  } catch (error: any) {
    elizaLogger.error("[ParlayTrading] Failed to accept bid:", error);
    throw error;
  }
}





export default parlayTradingAction;