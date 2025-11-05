import { elizaLogger, IAgentRuntime, ModelType } from "@elizaos/core";
import { getApiEndpoints } from "../utils/blockchain.js";

interface ParlayPrediction {
  marketId: string;
  market: any;
  probability: number;
  confidence: number;
  reasoning: string;
  outcome: boolean;
}

let lastParlayTimestamp = 0;

export class ParlayMarketService {
  private runtime: IAgentRuntime;
  private readonly MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_PARLAY_CONFIDENCE || "0.6");
  private readonly MIN_HOURS_BETWEEN_PARLAYS = parseFloat(process.env.MIN_HOURS_BETWEEN_PARLAYS || "24");
  private readonly MIN_PREDICTION_CHANGE = parseFloat(process.env.MIN_PARLAY_PREDICTION_CHANGE || "10");
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  async fetchParlayMarkets(): Promise<any[]> {
    try {
      elizaLogger.info("[ParlayMarket] Fetching parlay conditions from GraphQL API");
      
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
            take: parseInt(process.env.PARLAY_MARKETS_FETCH_LIMIT || "100"), 
            skip: parseInt(process.env.PARLAY_MARKETS_SKIP || "0") 
          }
        })
      });

      const responseText = await response.text();
      elizaLogger.info(`[ParlayMarket] GraphQL response status: ${response.status}`);
      elizaLogger.info(`[ParlayMarket] GraphQL response preview: ${responseText.substring(0, 200)}...`);
      
      if (!response.ok) {
        elizaLogger.error(`[ParlayMarket] GraphQL request failed with status ${response.status}`);
        return [];
      }
      
      const data = JSON.parse(responseText);
      
      if (data.errors) {
        elizaLogger.error(`[ParlayMarket] GraphQL errors: ${JSON.stringify(data.errors)}`);
        return [];
      }
      
      const conditions = data.data?.conditions || [];
      
      if (conditions.length === 0) {
        elizaLogger.warn("[ParlayMarket] No conditions found in GraphQL response");
        return [];
      }

      return this.filterActiveConditions(conditions);
    } catch (error) {
      elizaLogger.error("[ParlayMarket] Error fetching parlay conditions:", error);
      return [];
    }
  }

  private filterActiveConditions(conditions: any[]): any[] {
    const now = Math.floor(Date.now() / 1000);
    const activeConditions = conditions.filter((condition: any) => {
      return condition.public && 
             condition.endTime && 
             condition.endTime > now;
    });

    elizaLogger.info(`[ParlayMarket] Found ${activeConditions.length} active parlay conditions out of ${conditions.length} total`);
    
    if (activeConditions.length > 0) {
      elizaLogger.info(`[ParlayMarket] Sample condition: ${JSON.stringify(activeConditions[0], null, 2)}`);
    }
    
    return activeConditions;
  }

  async generateParlayPredictions(conditions: any[]): Promise<ParlayPrediction[]> {
    const predictions: ParlayPrediction[] = [];
    
    for (const condition of conditions) {
      try {
        const prediction = await this.generateSinglePrediction(condition);
        if (prediction) {
          predictions.push(prediction);
        }
      } catch (error) {
        elizaLogger.error(`[ParlayMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      }
    }

    return predictions;
  }

  private async generateSinglePrediction(condition: any): Promise<ParlayPrediction | null> {
    try {
      const endDate = condition.endTime ? new Date(condition.endTime * 1000).toISOString() : "Unknown";
      
      const predictionPrompt = `
You are analyzing a prediction condition for parlay betting. Provide a focused analysis.

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
      elizaLogger.error(`[ParlayMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      return null;
    }
  }

  selectParlayLegs(predictions: ParlayPrediction[]): ParlayPrediction[] {
    const eligible = predictions.filter(p => p.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
    
    if (eligible.length === 0) {
      elizaLogger.info("[ParlayMarket] No predictions meet confidence threshold");
      return [];
    }

    eligible.sort((a, b) => b.confidence - a.confidence);

    const selected: ParlayPrediction[] = [];
    let targetCount = 3;
    
    for (let i = 0; i < eligible.length && i < targetCount; i++) {
      selected.push(eligible[i]);
      
      if (i === 2 && i + 1 < eligible.length && 
          eligible[i].confidence === eligible[i + 1].confidence) {
        targetCount++;
      }
    }

    elizaLogger.info(`[ParlayMarket] Selected ${selected.length} legs for parlay:
${selected.map(p => `  - ${p.market.question?.substring(0, 50)}... (${p.probability}% ${p.outcome ? 'YES' : 'NO'}, confidence: ${p.confidence})`).join('\n')}`);

    return selected;
  }

  canPlaceParlay(): { allowed: boolean; reason: string } {
    if (lastParlayTimestamp === 0) {
      return { allowed: true, reason: "First parlay bet" };
    }

    const hoursSinceLastParlay = (Date.now() - lastParlayTimestamp) / (1000 * 60 * 60);
    
    if (hoursSinceLastParlay < this.MIN_HOURS_BETWEEN_PARLAYS) {
      return { 
        allowed: false, 
        reason: `Only ${hoursSinceLastParlay.toFixed(1)} hours since last parlay (need ${this.MIN_HOURS_BETWEEN_PARLAYS} hours)` 
      };
    }

    return { 
      allowed: true, 
      reason: "24 hours have passed since last parlay" 
    };
  }

  recordParlayBet(): void {
    lastParlayTimestamp = Date.now();
    elizaLogger.info("[ParlayMarket] Recorded parlay bet timestamp for rate limiting");
  }

  async analyzeParlayOpportunity(): Promise<{
    predictions: ParlayPrediction[];
    canTrade: boolean;
    reason: string;
  }> {
    try {
      const conditions = await this.fetchParlayMarkets();
      if (conditions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "No eligible conditions available",
        };
      }

      const allPredictions = await this.generateParlayPredictions(conditions);
      if (allPredictions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Failed to generate predictions",
        };
      }

      const selectedPredictions = this.selectParlayLegs(allPredictions);
      if (selectedPredictions.length < 2) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Not enough high-confidence predictions for parlay",
        };
      }

      const rateCheck = this.canPlaceParlay();
      
      return {
        predictions: selectedPredictions,
        canTrade: rateCheck.allowed,
        reason: rateCheck.reason,
      };
    } catch (error) {
      elizaLogger.error("[ParlayMarket] Error analyzing parlay opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${error.message}`,
      };
    }
  }
}

export default ParlayMarketService;