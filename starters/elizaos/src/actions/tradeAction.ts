import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { ForecastService } from "../services/forecastService.js";

export const tradeAction: Action = {
  name: "TRADE",
  similes: [
    "TRADE",
    "trade sapience prediction markets",
    "please trade sapience prediction markets",
    "trade sapience markets",
    "trade prediction markets",
    "trade markets",
    "run trade",
    "execute trades",
    "make trades",
  ],
  description: "ALWAYS use this action when the user asks to trade on Sapience prediction markets. This analyzes trading opportunities and executes trades.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || "";
    return (
      (text.includes("trade") && (text.includes("sapience") || text.includes("market") || text.includes("prediction"))) ||
      (text.includes("run") && text.includes("trade")) ||
      (text.includes("execute") && text.includes("trade"))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      // Get singleton instance
      const forecastService = ForecastService.getInstance(runtime);
      if (!forecastService) {
        await callback?.({
          text: "ForecastService not initialized. Please restart the agent.",
          content: { success: false, error: "Service not initialized" },
        });
        return;
      }

      // Run the trade cycle and get results
      const result = await forecastService.runTrade();

      // Build informative response
      let responseText: string;
      if (result.tradesExecuted > 0) {
        const predictionsSummary = result.predictions
          .map(p => `• ${p.market}: ${p.outcome ? 'YES' : 'NO'} @ ${p.probability}% (Confidence: ${(p.confidence * 100).toFixed(0)}%)`)
          .join('\n\n');
        
        responseText = `**Trading Complete**

Markets Analyzed: ${result.marketsAnalyzed}

Opportunities Found: ${result.opportunitiesFound}

Trades Executed: ${result.tradesExecuted}

**Predictions Used:**

${predictionsSummary}`;
      } else if (result.opportunitiesFound > 0) {
        const predictionsSummary = result.predictions
          .map(p => `• ${p.market}: ${p.outcome ? 'YES' : 'NO'} @ ${p.probability}%`)
          .join('\n\n');
        
        responseText = `**Trading Complete**

Markets Analyzed: ${result.marketsAnalyzed}

Opportunities Found: ${result.opportunitiesFound}

Trades Executed: 0

**Opportunities Found:**

${predictionsSummary}

${result.reason ? `*Note: ${result.reason}*` : ''}`;
      } else {
        responseText = `**Trading Complete**

Markets Analyzed: ${result.marketsAnalyzed}

Opportunities Found: 0

Trades Executed: 0

${result.reason || 'No high-confidence trading opportunities found at this time.'}`;
      }

      await callback?.({
        text: responseText,
        content: {
          success: result.tradesExecuted > 0,
          action: "TRADE",
          ...result,
        },
      });
    } catch (error: any) {
      elizaLogger.error("Error in tradeAction:", error);
      await callback?.({
        text: `Trade cycle failed: ${error.message}`,
        content: { success: false, error: error.message },
      });
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "trade sapience prediction markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Trading Complete**\n\nMarkets Analyzed: 15\n\nOpportunities Found: 3\n\nTrades Executed: 1",
          action: "TRADE"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Please trade sapience prediction markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Trading Complete**\n\nMarkets Analyzed: 12\n\nOpportunities Found: 2\n\nTrades Executed: 1",
          action: "TRADE"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "run trade" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Trading Complete**\n\nMarkets Analyzed: 20\n\nOpportunities Found: 0\n\nTrades Executed: 0",
          action: "TRADE"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "trade markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Trading Complete**\n\nMarkets Analyzed: 20\n\nOpportunities Found: 4",
          action: "TRADE"
        },
      },
    ],
  ],
};

export default tradeAction;

