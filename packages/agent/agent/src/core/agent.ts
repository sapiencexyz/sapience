import { AgentState, AgentConfig, AgentTools } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { GraphManager } from './graph.js';
import { AgentSystemMessage } from '../types/message.js';

export class FoilAgent {
  private graphManager: GraphManager;
  private isRunning: boolean = false;
  private state: AgentState | null = null;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    Logger.info("Initializing FoilAgent with config:");
    Logger.info(JSON.stringify(config, null, 2));
    this.graphManager = new GraphManager(config, tools);
  }

  private async initializeState(): Promise<AgentState> {
    if (this.state) {
      // Keep existing messages but update other state
      return {
        ...this.state,
        currentStep: 'initialize',
        positions: [],
        markets: [],
        actions: []
      };
    }

    Logger.step('[Initialize] Starting new trading session...');
    
    const systemMessage = new AgentSystemMessage(
      `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
      1. Settling positions when appropriate
      2. Assessing and modifying existing positions
      3. Discovering new market opportunities
      4. Publishing trading summaries
      
      You have access to the following tools:
      - readFoilContracts: Tools for reading market data, positions, and contract state
      - writeFoilContracts: Tools for modifying positions, settling trades, and interacting with the protocol
      - graphql: Tools for querying additional protocol data and market information
      
      Each tool has specific parameters and requirements. Always check the tool descriptions before using them.
      The current state (positions, markets, actions) will be provided in each message to help you make informed decisions.`
    );

    return {
      messages: [systemMessage],
      currentStep: 'initialize',
      positions: [],
      markets: [],
      actions: []
    };
  }

  public async start() {
    if (this.isRunning) {
      Logger.warn("Agent is already running");
      return;
    }

    this.isRunning = true;
    Logger.info("Starting Foil trading agent...");

    try {
      const initialState = await this.initializeState();
      await this.graphManager.invoke(initialState);
    } catch (error) {
      Logger.error(`Error in trading agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.stop();
    }
  }

  public stop() {
    if (!this.isRunning) {
      Logger.warn("Agent is not running");
      return;
    }

    this.isRunning = false;
    Logger.success("Stopped Foil trading agent");
  }
} 