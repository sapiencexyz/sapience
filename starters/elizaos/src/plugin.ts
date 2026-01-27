import { Plugin } from "@elizaos/core";
import { attestMarketAction } from "./actions/attestMarket.js";
import { autonomousModeAction } from "./actions/autonomousMode.js";
import { callToolAction } from "./actions/callTool.js";
import { claimWinningsAction } from "./actions/claimWinningsAction.js";
import { forecastAction } from "./actions/forecastAction.js";
import { tradeAction } from "./actions/tradeAction.js";
import { tradingAction } from "./actions/tradingAction.js";
import { readResourceAction } from "./actions/readResource.js";
import { simulateTransactionAction } from "./actions/simulateTransaction.js";
import { submitTransactionAction } from "./actions/submitTransaction.js";
import { SapienceService } from "./services/sapienceService.js";

// Custom plugin for agent-specific attestation logic
// Provides Sapience MCP access and transaction submission without external plugin
export const customActionsPlugin: Plugin = {
  name: "custom-actions",
  description: "Custom attestation logic for prediction agent",

  // Custom actions for attestation and autonomous mode control
  actions: [
    attestMarketAction,
    autonomousModeAction,
    callToolAction,
    claimWinningsAction,
    forecastAction,
    tradeAction,
    tradingAction,
    readResourceAction,
    simulateTransactionAction,
    submitTransactionAction,
  ],

  // No providers - we use sapience plugin for data
  providers: [],

  // Register local Sapience MCP service so runtime.getService('sapience') works
  services: [SapienceService],

  evaluators: [],
};

export default customActionsPlugin;
