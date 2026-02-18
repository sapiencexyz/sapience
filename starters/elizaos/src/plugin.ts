import { Plugin } from "@elizaos/core";
import { attestMarketAction } from "./actions/attestMarket.js";
import { autonomousModeAction } from "./actions/autonomousMode.js";
import { claimWinningsAction } from "./actions/claimWinningsAction.js";
import { forecastAction } from "./actions/forecastAction.js";
import { tradeAction } from "./actions/tradeAction.js";
import { tradingAction } from "./actions/tradingAction.js";
import { simulateTransactionAction } from "./actions/simulateTransaction.js";
import { submitTransactionAction } from "./actions/submitTransaction.js";

// Custom plugin for agent-specific attestation logic
// Provides transaction submission without external plugin
export const customActionsPlugin: Plugin = {
  name: "custom-actions",
  description: "Custom attestation logic for prediction agent",

  // Custom actions for attestation and autonomous mode control
  actions: [
    attestMarketAction,
    autonomousModeAction,
    claimWinningsAction,
    forecastAction,
    tradeAction,
    tradingAction,
    simulateTransactionAction,
    submitTransactionAction,
  ],

  // No providers - we use sapience plugin for data
  providers: [],

  services: [],

  evaluators: [],
};

export default customActionsPlugin;
