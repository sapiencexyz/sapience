import { FoilAgent } from './core/agent.js';
import { AgentConfig } from './types/index.js';
import { Logger } from './utils/logger.js';

// Get interval from command line args or default to 0 (run once)
const interval = parseInt(process.argv[2] || '0', 10);

// Initialize agent config
const config: AgentConfig = {
  interval,
  maxPositionsPerMarket: 5,
  minCollateral: "100000000000000000", // 0.1 ETH
  maxCollateral: "1000000000000000000", // 1 ETH
  targetLeverage: 2,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  // Use Ollama by default when running with "once"
  useOllama: interval === 0 || process.env.USE_OLLAMA === 'true',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama2',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
};

// Initialize tools
const tools = {
  graphql: await import('../../tools/graphql.js'),
  writeFoilContracts: await import('../../tools/writeFoilContracts.js'),
  readFoilContracts: await import('../../tools/readFoilContracts.js')
};

// Create and start the agent
const agent = new FoilAgent(config, tools);

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