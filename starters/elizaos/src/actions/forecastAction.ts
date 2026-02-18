import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { ForecastService } from "../services/forecastService.js";

export const forecastAction: Action = {
  name: "FORECAST",
  similes: [
    "FORECAST",
    "forecast sapience prediction markets",
    "please forecast sapience prediction markets",
    "forecast sapience markets",
    "forecast prediction markets",
    "forecast markets",
    "run forecast",
    "make predictions",
    "generate forecasts",
    "analyze markets",
  ],
  description: "ALWAYS use this action when the user asks to forecast, predict, or analyze Sapience prediction markets. This runs a forecast cycle that generates predictions and submits on-chain attestations.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || "";
    return (
      (text.includes("forecast") && (text.includes("sapience") || text.includes("market") || text.includes("prediction"))) ||
      (text.includes("run") && text.includes("forecast")) ||
      (text.includes("predict") && text.includes("market"))
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

      // Run the forecast cycle and get results
      const result = await forecastService.runForecast();

      // Build informative response
      let responseText: string;
      const submissionNote = result.submissionsEnabled 
        ? '' 
        : '\n\n*Note: No private key configured - predictions shown but not submitted on-chain.*';

      if (result.predictions.length > 0) {
        const predictionsSummary = result.predictions
          .map(p => `• ${p.market}: ${p.probability}% chance (Confidence: ${(p.confidence * 100).toFixed(0)}%)`)
          .join('\n\n');
        
        responseText = `**Forecasting Complete**

Markets Analyzed: ${result.marketsAnalyzed}

${result.submissionsEnabled ? 'Forecasts Submitted' : 'Forecasts Generated'}: ${result.predictions.length}

**Predictions:**

${predictionsSummary}${submissionNote}`;
      } else {
        responseText = `**Forecasting Complete**

Markets Analyzed: ${result.marketsAnalyzed}

Forecasts Submitted: 0

No markets needed new forecasts at this time. Markets are either:
- Recently attested (within ${process.env.MIN_HOURS_BETWEEN_ATTESTATIONS || '24'}h)
- Below confidence threshold
- Probability hasn't changed significantly${submissionNote}`;
      }

      await callback?.({
        text: responseText,
        content: {
          success: true,
          action: "FORECAST",
          ...result,
        },
      });
    } catch (error: any) {
      elizaLogger.error("Error in forecastAction:", error);
      await callback?.({
        text: `Forecast cycle failed: ${error.message}`,
        content: { success: false, error: error.message },
      });
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "forecast sapience prediction markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Forecasting Complete**\n\nMarkets Analyzed: 15\n\nForecasts Submitted: 3\n\n**Predictions:**\n\n• Will X happen?: 65% chance (Confidence: 70%)",
          action: "FORECAST"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Please forecast sapience prediction markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Forecasting Complete**\n\nMarkets Analyzed: 12\n\nForecasts Submitted: 2\n\n**Predictions:**\n\n• Market question?: 55% chance (Confidence: 65%)",
          action: "FORECAST"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "run forecast" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Forecasting Complete**\n\nMarkets Analyzed: 20\n\nForecasts Submitted: 5",
          action: "FORECAST"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "forecast markets" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Forecasting Complete**\n\nMarkets Analyzed: 20\n\nForecasts Submitted: 5",
          action: "FORECAST"
        },
      },
    ],
  ],
};

export default forecastAction;

