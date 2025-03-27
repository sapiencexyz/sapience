/// <reference types="node" />
import { FoilAgent } from "./foil-agent";
import { AgentConfig, AgentTools } from "./types";
import * as graphqlTools from '../tools/graphql';
import * as readFoilTools from '../tools/readFoilContracts';
import * as writeFoilTools from '../tools/writeFoilContracts';

// Get interval from command line args or use default
const interval = process.argv[2] ? parseInt(process.argv[2]) : 5 * 60 * 1000; // Default 5 minutes

// Configuration
const config: AgentConfig = {
  interval,
  maxPositionsPerMarket: 3,
  minCollateral: "100000000000000000", // 0.1 ETH
  maxCollateral: "1000000000000000000", // 1 ETH
  targetLeverage: 2,
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  useOllama: process.env.NODE_ENV === "development",
  ollamaModel: "llama3.2", // Fast and capable model for development
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
};

// Use the actual MCP tools
const tools: AgentTools = {
  graphql: graphqlTools,
  writeFoilContracts: writeFoilTools,
  readFoilContracts: readFoilTools,
};

async function main() {
  // Create and start the agent
  const agent = new FoilAgent(config, tools);
  
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    agent.stop();
    process.exit(0);
  });

  // Start the agent
  await agent.start();
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
} 