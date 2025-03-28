import 'dotenv/config';
import { FoilAgent } from './core/agent.js';
import { AgentConfig, BaseTool } from './types/index.js';
import { Logger } from './utils/logger.js';
import { privateKeyToAccount } from 'viem/accounts';

// Get interval from command line args or default to 0 (run once)
const interval = parseInt(process.argv[2] || '0', 10);

// Initialize agent config
const config: AgentConfig = {
  interval,
  maxPositionsPerMarket: 5,
  minCollateral: "100000000000000000", // 0.1 ETH
  maxCollateral: "1000000000000000000", // 1 ETH
  targetLeverage: 2,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  useOllama: false // Always use Claude
};

// Get private key from environment
const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
if (!privateKey) {
  throw new Error('ETHEREUM_PRIVATE_KEY environment variable is required');
}

// Derive agent address from private key
const account = privateKeyToAccount(privateKey as `0x${string}`);
const agentAddress = account.address;

// Initialize tools
const rawTools = {
  graphql: await import('../tools/graphql.js'),
  writeFoilContracts: await import('../tools/writeFoilContracts.js'),
  readFoilContracts: await import('../tools/readFoilContracts.js')
};

// Convert tools to BaseTool format
const tools = {
  graphql: Object.entries(rawTools.graphql as Record<string, any>).reduce((acc, [toolName, tool]) => {
    acc[toolName] = {
      name: toolName,
      description: tool.description,
      parameters: tool.parameters,
      function: tool.function
    } as BaseTool;
    return acc;
  }, {} as Record<string, BaseTool>),
  writeFoilContracts: Object.entries(rawTools.writeFoilContracts as Record<string, any>).reduce((acc, [toolName, tool]) => {
    acc[toolName] = {
      name: toolName,
      description: tool.description,
      parameters: tool.parameters,
      function: tool.function
    } as BaseTool;
    return acc;
  }, {} as Record<string, BaseTool>),
  readFoilContracts: Object.entries(rawTools.readFoilContracts as Record<string, any>).reduce((acc, [toolName, tool]) => {
    acc[toolName] = {
      name: toolName,
      description: tool.description,
      parameters: tool.parameters,
      function: tool.function
    } as BaseTool;
    return acc;
  }, {} as Record<string, BaseTool>)
};

// Create and start the agent
const agent = new FoilAgent(config, tools, agentAddress);

// Handle process termination
process.on('SIGINT', async () => {
  Logger.info('Received SIGINT. Stopping agent...');
  await agent.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  Logger.info('Received SIGTERM. Stopping agent...');
  await agent.stop();
  process.exit(0);
});

// Start the agent
Logger.info(`Starting agent with interval: ${interval}ms`);
Logger.info(`Using Ollama: ${config.useOllama}`);
await agent.start(); 