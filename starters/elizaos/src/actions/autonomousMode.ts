import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { ForecastService } from "../services/forecastService.js";

export const autonomousModeAction: Action = {
  name: "AUTONOMOUS_MODE",
  similes: [
    "start auto",
    "stop auto",
    "agent status",
    "start autonomous",
    "stop autonomous",
  ],
  description: "Control autonomous mode for forecasting and trading cycles",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || "";
    return (
      (text.includes("start") && (text.includes("auto") || text.includes("autonomous"))) ||
      (text.includes("stop") && (text.includes("auto") || text.includes("autonomous"))) ||
      text.includes("agent status")
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      const text = message.content?.text?.toLowerCase() || "";

      // Get singleton instance
      const forecastService = ForecastService.getInstance(runtime);
      if (!forecastService) {
        await callback?.({
          text: "ForecastService not initialized. Please restart the agent.",
          content: { success: false, error: "Service not initialized" },
        });
        return;
      }

      // "start auto" - start autonomous mode
      if (text.includes("start") && (text.includes("auto") || text.includes("autonomous"))) {
        await forecastService.startAutonomous();
        const status = forecastService.getStatus();
        const modesStr = status.modes.length > 0 ? status.modes.join(", ") : "none (set AUTONOMOUS_MODE env)";
        await callback?.({
          text: `**Autonomous Mode Started**

Modes: ${modesStr}
Interval: ${status.interval / 1000} seconds
Min Confidence: ${(status.minConfidence * 100).toFixed(0)}%
Batch Size: ${status.batchSize}

The agent will automatically run forecast/trade cycles at the configured interval.`,
          content: { success: true, status },
        });
        return;
      }

      // "stop auto" - stop autonomous mode
      if (text.includes("stop") && (text.includes("auto") || text.includes("autonomous"))) {
        await forecastService.stop();
        await callback?.({
          text: "**Autonomous Mode Stopped**\n\nThe agent will no longer run automatic cycles. Use manual commands to trigger forecasts or trades.",
          content: { success: true },
        });
        return;
      }

      // "agent status" - show current status
      if (text.includes("agent status")) {
        const status = forecastService.getStatus();
        const modesStr = status.modes.length > 0 ? status.modes.join(", ") : "none";

        const response = `**Agent Status**

Running: ${status.isRunning ? "Yes" : "No"}
Modes: ${modesStr}
Interval: ${status.interval / 1000} seconds
Min Confidence: ${(status.minConfidence * 100).toFixed(0)}%
Batch Size: ${status.batchSize}

**Available Commands:**
• "forecast sapience prediction markets" - Run a forecast cycle
• "trade sapience prediction markets" - Run a trade cycle
• "start auto" - Start autonomous mode
• "stop auto" - Stop autonomous mode`;

        await callback?.({
          text: response,
          content: { success: true, status },
        });
        return;
      }

      // Default help
      await callback?.({
        text: `**Autonomous Mode Commands:**
• "start auto" - Start autonomous mode
• "stop auto" - Stop autonomous mode
• "agent status" - View current status

For manual operations, use:
• "forecast sapience prediction markets" - Run a single forecast cycle
• "trade sapience prediction markets" - Run a single trade cycle`,
        content: {},
      });
      return;
    } catch (error: any) {
      elizaLogger.error("Error in autonomousModeAction:", error);
      await callback?.({
        text: `Error: ${error.message}`,
        content: { success: false, error: error.message },
      });
      return;
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "start auto" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Autonomous Mode Started**\n\nModes: forecast, trade\nInterval: 300 seconds",
          action: "AUTONOMOUS_MODE"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "stop auto" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Autonomous Mode Stopped**",
          action: "AUTONOMOUS_MODE"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "agent status" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "**Agent Status**\n\nRunning: Yes\nModes: forecast, trade",
          action: "AUTONOMOUS_MODE"
        },
      },
    ],
  ],
};
