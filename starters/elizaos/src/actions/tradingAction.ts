import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { privateKeyToAccount } from "viem/accounts";
import { loadSdk } from "../utils/sdk.js";
import { 
  getPrivateKey, 
  getWalletAddress, 
  getTradingRpcUrl,
  getTradingConfig, 
  getApiEndpoints, 
  getTradingContractAddresses,
  CHAIN_ID_ETHEREAL,
} from "../utils/blockchain.js";
import { 
  getCurrentMakerNonce, 
  ensureTokenApproval, 
  buildMintCalldata 
} from "../utils/contracts.js";
import { 
  encodeTradeOutcomes, 
  selectBestBid, 
  formatWagerAmount 
} from "../utils/trading.js";

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

export const tradingAction: Action = {
  name: "TRADING",
  description: "Start trading auction with 2 legs from different categories and accept best bid from takers",
  similes: ["trade markets", "make trade", "start auction", "bet trade"],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      // Parse trade data from message - expect multiple market predictions
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide trade data: {"markets": [...], "predictions": [...]}',
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

      // Validate we have at least 2 legs for trade (from different categories)
      if (!markets || !predictions || markets.length < 2 || predictions.length < 2) {
        await callback?.({
          text: "Trading requires at least 2 market predictions from different categories",
          content: {},
        });
        return;
      }

      // Get wallet details - trading uses Ethereal chain
      const privateKey = getPrivateKey();
      const walletAddress = getWalletAddress();
      const rpcUrl = getTradingRpcUrl();
      const { wagerAmount } = getTradingConfig();

      elizaLogger.info(`[Trading] Starting trading auction with ${markets.length} legs`);

      // Start auction as maker
      const auctionResult = await startTradingAuction({
        markets,
        predictions,
        walletAddress,
        wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[Trading] Trade executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `Trade executed: ${markets.length} legs, wager ${formatWagerAmount(wagerAmount)} (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            legs: markets.length,
            predictions: predictions.map(p => ({ market: p.market, probability: p.probability })),
            txHash: auctionResult.txHash,
          },
        });
      } else {
        throw new Error(auctionResult.error || "Trading auction failed");
      }
    } catch (err: any) {
      elizaLogger.error("[Trading] Trading failed:", err);
      await callback?.({
        text: `Trading failed: ${err?.message}`,
        content: { success: false, error: err?.message },
      });
    }
  },
};

async function startTradingAuction({
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
        elizaLogger.info(`[Trading] Auction timeout after ${auctionTimeoutMs/1000}s for auction ${auctionId}. No bids received.`);
        console.log(`⏰ Trading auction timeout: No takers found for our ${markets.length}-leg trade after ${auctionTimeoutMs/1000}s.`);
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
        elizaLogger.info("[Trading] Connected to auction WebSocket as TAKER");
        startKeepAlive();

        const contractNonce = await getCurrentMakerNonce(walletAddress as `0x${string}`, rpcUrl);
        elizaLogger.info(`[Trading] Using contract taker nonce: ${contractNonce}`);

        // Trading uses Ethereal chain with lzPMResolver
        const { RESOLVER } = getTradingContractAddresses();
        const predictedOutcomes = await encodeTradeOutcomes(markets, predictions);

        // Prepare base auction payload
        const payload = {
          taker: walletAddress,
          wager: wagerAmount,
          resolver: RESOLVER,
          predictedOutcomes,
          takerNonce: contractNonce,
          chainId: CHAIN_ID_ETHEREAL,
        };

        // Sign the auction request to get actionable bids from market makers (like the vault)
        // Unsigned requests return quote-only bids (maker = 0x0000..., signature = 0x0000...)
        const sdk = await loadSdk();
        const account = privateKeyToAccount(getPrivateKey() as `0x${string}`);
        const { domain, uri } = sdk.extractSiweDomainAndUri(sapienceWs);
        const issuedAt = new Date().toISOString();
        const message = sdk.createAuctionStartSiweMessage(payload, domain, uri, issuedAt);
        const takerSignature = await account.signMessage({ message });
        const takerSignedAt = issuedAt;

        const auctionMessage = {
          type: "auction.start",
          payload: {
            ...payload,
            takerSignature,
            takerSignedAt,
          },
        };

        elizaLogger.info(`[Trading] Starting trading auction: ${JSON.stringify(auctionMessage)}`);
        socket.send(JSON.stringify(auctionMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[Trading] Received message type: ${message.type}`);
          
          if (message.type === "auction.bids") {
            elizaLogger.info(`[Trading] Bid message payload keys: ${Object.keys(message.payload || {})}`);
          } else {
            elizaLogger.info(`[Trading] Full message: ${JSON.stringify(message)}`);
          }

          if (message.type === "auction.ack") {
            auctionId = message.payload?.auctionId;
            elizaLogger.info(`[Trading] Auction acknowledged with ID: ${auctionId}`);
            
            if (auctionId) {
              socket.send(JSON.stringify({
                type: "auction.subscribe",
                payload: { auctionId }
              }));
              elizaLogger.info(`[Trading] Subscribed to auction bids for ${auctionId}`);
              console.log(`🎯 Trading auction live! Waiting for takers to bid on our ${markets.length}-leg trade (Auction ID: ${auctionId})`);
              
              const { statusIntervalMs } = getTradingConfig();
              const statusInterval = setInterval(() => {
                elizaLogger.info(`[Trading] Still waiting for bids on auction ${auctionId}...`);
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
            elizaLogger.info(`[Trading] Received ${allBids.length} total bids`);
            
            const ourBids = allBids.filter((bid: Bid) => bid?.auctionId === auctionId);
            elizaLogger.info(`[Trading] Found ${ourBids.length} bids for our auction ${auctionId}`);

            if (ourBids.length > 0) {
              const bestBid = selectBestBid(ourBids);
              elizaLogger.info(`[Trading] Selected best bid: ${JSON.stringify(bestBid)}`);

              const privateKey = getPrivateKey();
              
              const txHash = await acceptBid({
                bid: bestBid,
                privateKey,
                rpcUrl,
              });

              resolveOnce({ success: true, txHash });
            }
          } else if (message.type === "auction.error") {
            elizaLogger.error("[Trading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          } else {
            elizaLogger.info(`[Trading] Unhandled message type: ${message.type}`);
          }
        } catch (error: any) {
          elizaLogger.error("[Trading] Error processing message:", error);
          resolveOnce({ success: false, error: error.message });
        }
      };

      socket.onerror = (error: any) => {
        elizaLogger.error("[Trading] WebSocket error:", error);
        resolveOnce({ success: false, error: "WebSocket error" });
      };

      socket.onclose = (event) => {
        elizaLogger.info(`[Trading] WebSocket closed: ${event.code} ${event.reason}`);
        if (!resolved) {
          if (event.code === 1006) {
            elizaLogger.warn("[Trading] Connection closed abnormally - server may not be available");
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
    const requesterAddress = getWalletAddress(); // Requester = auction creator (agent)
    
    // Trading uses Ethereal chain
    const { PREDICTION_MARKET } = getTradingContractAddresses();
    
    // Get the requester's nonce from the contract (required for mint)
    const requesterNonce = BigInt(await getCurrentMakerNonce(requesterAddress, rpcUrl));
    elizaLogger.info(`[Trading] Requester nonce: ${requesterNonce}, Responder (bidder): ${bid.maker}`);
    
    const mintCalldata = await buildMintCalldata({
      bid,
      requester: requesterAddress,
      requesterNonce,
    });
    
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: bid.takerCollateral || bid.wager || '0',
    });

    elizaLogger.info("[Trading] Executing trade mint transaction on Ethereal...");
    elizaLogger.info(`[Trading] Requester (auction creator): ${requesterAddress}`);
    elizaLogger.info(`[Trading] Responder (bidder): ${bid.maker}`);
    elizaLogger.info(`[Trading] Collateral - Requester: ${bid.takerCollateral || bid.wager}, Responder: ${bid.makerWager}`);
    elizaLogger.info(`[Trading] Requester nonce: ${requesterNonce}`);
    
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      chainId: CHAIN_ID_ETHEREAL,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: PREDICTION_MARKET,
        data: mintCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[Trading] Trade TX: ${mintTx.hash}`);
    return mintTx.hash;
  } catch (error: any) {
    elizaLogger.error("[Trading] Failed to accept bid:", error);
    throw error;
  }
}





export default tradingAction;

