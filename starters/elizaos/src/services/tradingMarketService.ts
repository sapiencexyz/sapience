import { elizaLogger, IAgentRuntime, ModelType } from "@elizaos/core";
import { getApiEndpoints } from "../utils/blockchain.js";

interface TradingPrediction {
  marketId: string;
  market: any;
  probability: number;
  confidence: number;
  reasoning: string;
  outcome: boolean;
}

export class TradingMarketService {
  private runtime: IAgentRuntime;
  private readonly MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6");
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  async fetchTradingMarkets(): Promise<any[]> {
    try {
      elizaLogger.info("[TradingMarket] Fetching trading conditions from GraphQL API");
      
      const { sapienceGraphql } = getApiEndpoints();
      const query =  /* GraphQL */ `
        query Conditions($take: Int, $skip: Int) {
          conditions(orderBy: { createdAt: desc }, take: $take, skip: $skip) {
            id
            createdAt
            question
            shortName
            endTime
            public
            claimStatement
            description
            similarMarkets
            category {
              id
              name
              slug
            }
          }
        }
      `;
      
      const response = await fetch(sapienceGraphql, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { 
            take: parseInt(process.env.TRADING_MARKETS_FETCH_LIMIT || "100"), 
            skip: parseInt(process.env.TRADING_MARKETS_SKIP || "0") 
          }
        })
      });

      const responseText = await response.text();
      elizaLogger.info(`[TradingMarket] GraphQL response status: ${response.status}`);
      elizaLogger.info(`[TradingMarket] GraphQL response preview: ${responseText.substring(0, 200)}...`);
      
      if (!response.ok) {
        elizaLogger.error(`[TradingMarket] GraphQL request failed with status ${response.status}`);
        return [];
      }
      
      const data = JSON.parse(responseText);
      
      if (data.errors) {
        elizaLogger.error(`[TradingMarket] GraphQL errors: ${JSON.stringify(data.errors)}`);
        return [];
      }
      
      const conditions = data.data?.conditions || [];
      
      if (conditions.length === 0) {
        elizaLogger.warn("[TradingMarket] No conditions found in GraphQL response");
        return [];
      }

      return this.filterActiveConditions(conditions);
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error fetching trading conditions:", error);
      return [];
    }
  }

  private filterActiveConditions(conditions: any[]): any[] {
    const now = Math.floor(Date.now() / 1000);
    const activeConditions = conditions.filter((condition: any) => {
      // Must be public, not expired, and have at least one similar market to trade (most likely to attract bids)
      const hasSimilarMarkets = condition.similarMarkets && 
                                Array.isArray(condition.similarMarkets) && 
                                condition.similarMarkets.length > 0;
      
      return condition.public && 
             condition.endTime && 
             condition.endTime > now &&
             hasSimilarMarkets;
    });

    elizaLogger.info(`[TradingMarket] Found ${activeConditions.length} tradeable conditions out of ${conditions.length} total (filtered for similarMarkets)`);
    
    if (activeConditions.length > 0) {
      elizaLogger.info(`[TradingMarket] Sample condition: ${JSON.stringify(activeConditions[0], null, 2)}`);
    }
    
    return activeConditions;
  }

  async generateTradingPredictions(conditions: any[]): Promise<TradingPrediction[]> {
    const predictions: TradingPrediction[] = [];
    
    for (const condition of conditions) {
      try {
        const prediction = await this.generateSinglePrediction(condition);
        if (prediction) {
          predictions.push(prediction);
        }
      } catch (error) {
        elizaLogger.error(`[TradingMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      }
    }

    return predictions;
  }

  private async generateSinglePrediction(condition: any): Promise<TradingPrediction | null> {
    try {
      const endDate = condition.endTime ? new Date(condition.endTime * 1000).toISOString() : "Unknown";
      
      const predictionPrompt = `
You are analyzing a prediction condition for trading. Provide a focused analysis.

Question: ${condition.question}
Claim Statement: ${condition.claimStatement}
Description: ${condition.description || "No additional description"}
End Date: ${endDate}
Category: ${condition.category?.name || "Unknown"}

Analyze this condition and respond with ONLY valid JSON:
{
  "probability": <number 0-100>,
  "confidence": <number 0.0-1.0>,
  "reasoning": "<concise analysis under 100 characters>"
}

Focus on objective factors and data-driven analysis.`;

      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, { 
        prompt: predictionPrompt 
      });
      
      let predictionData;
      try {
        predictionData = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          predictionData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Invalid JSON response");
        }
      }

      if (!predictionData.probability || predictionData.confidence === undefined || !predictionData.reasoning) {
        throw new Error("Incomplete prediction data");
      }

      return {
        marketId: condition.id,
        market: condition,
        probability: predictionData.probability,
        confidence: predictionData.confidence,
        reasoning: predictionData.reasoning,
        outcome: predictionData.probability > 50, // YES if >50%, NO if <=50%
      };
    } catch (error) {
      elizaLogger.error(`[TradingMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      return null;
    }
  }

  selectTradingLegs(predictions: TradingPrediction[]): TradingPrediction[] {
    // Filter to high-confidence predictions
    const eligible = predictions.filter(p => p.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
    
    if (eligible.length < 2) {
      elizaLogger.info("[TradingMarket] Not enough predictions meet confidence threshold (need at least 2)");
      return [];
    }

    // Group by category
    const byCategory = new Map<number, TradingPrediction[]>();
    for (const p of eligible) {
      const catId = p.market.category?.id ?? -1;
      if (!byCategory.has(catId)) byCategory.set(catId, []);
      byCategory.get(catId)!.push(p);
    }

    // Need at least 2 different categories
    if (byCategory.size < 2) {
      elizaLogger.info("[TradingMarket] Not enough different categories for trade (need at least 2)");
      return [];
    }

    // Pick one random prediction from two different categories
    const categories = [...byCategory.keys()];
    const shuffled = categories.sort(() => Math.random() - 0.5);
    const cat1 = shuffled[0];
    const cat2 = shuffled[1];

    const cat1Predictions = byCategory.get(cat1)!;
    const cat2Predictions = byCategory.get(cat2)!;
    
    const pick1 = cat1Predictions[Math.floor(Math.random() * cat1Predictions.length)];
    const pick2 = cat2Predictions[Math.floor(Math.random() * cat2Predictions.length)];

    const selected = [pick1, pick2];

    elizaLogger.info(`[TradingMarket] Selected 2 legs for trade from different categories:
${selected.map(p => `  - [${p.market.category?.name || 'Unknown'}] ${p.market.question?.substring(0, 50)}... (${p.probability}% ${p.outcome ? 'YES' : 'NO'}, confidence: ${p.confidence})`).join('\n')}`);

    return selected;
  }

  async analyzeTradingOpportunity(): Promise<{
    predictions: TradingPrediction[];
    canTrade: boolean;
    reason: string;
  }> {
    try {
      const conditions = await this.fetchTradingMarkets();
      if (conditions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "No eligible conditions available",
        };
      }

      const allPredictions = await this.generateTradingPredictions(conditions);
      if (allPredictions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Failed to generate predictions",
        };
      }

      const selectedPredictions = this.selectTradingLegs(allPredictions);
      if (selectedPredictions.length < 2) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Not enough high-confidence predictions from different categories (need 2)",
        };
      }

      return {
        predictions: selectedPredictions,
        canTrade: true,
        reason: `Found ${selectedPredictions.length} high-confidence predictions from different categories`,
      };
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error analyzing trading opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${(error as Error).message}`,
      };
    }
  }
}

export default TradingMarketService;

