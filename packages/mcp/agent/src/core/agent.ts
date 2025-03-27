import { AgentState, AgentConfig, AgentTools } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { GraphManager } from './graph.js';
import { AgentSystemMessage } from '../types/message.js';

export class FoilAgent {
  private graphManager: GraphManager;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private isIterationRunning: boolean = false;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    Logger.info("Initializing FoilAgent with config:");
    Logger.info(JSON.stringify(config, null, 2));
    this.graphManager = new GraphManager(config, tools);
  }

  private async initializeState(): Promise<AgentState> {
    Logger.step('[Initialize] Starting new trading session...');
    
    const systemMessage = new AgentSystemMessage(
      `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
      1. Settling positions when appropriate
      2. Assessing and modifying existing positions
      3. Discovering new market opportunities
      4. Publishing trading summaries
      
      Use the available tools to interact with the Foil protocol and make trading decisions.`
    );

    return {
      messages: [systemMessage],
      currentStep: 'initialize',
      positions: [],
      markets: [],
      actions: []
    };
  }

  private async runIteration() {
    if (this.isIterationRunning) {
      Logger.warn("Previous iteration still running, skipping this iteration");
      return;
    }

    this.isIterationRunning = true;
    try {
      Logger.info("Starting new trading iteration");
      const state = await this.initializeState();
      
      const finalState = await this.graphManager.invoke(state);
      Logger.success("Trading iteration completed");
      
      // Only log the final summary message
      const lastMessage = finalState.messages[finalState.messages.length - 1];
      if (lastMessage) {
        Logger.step('[Final Summary]');
        Logger.messageBlock([
          { role: lastMessage.type, content: lastMessage.content }
        ]);
      }
    } catch (error) {
      Logger.error(`Error in trading iteration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isIterationRunning = false;
    }
  }

  public async start() {
    if (this.isRunning) {
      Logger.warn("Agent is already running");
      return;
    }

    this.isRunning = true;
    Logger.info("Starting Foil trading agent...");

    // Run immediately on start
    await this.runIteration();

    // Only set up interval if it's greater than 0
    if (this.config.interval > 0) {
      Logger.info(`Setting up trading interval of ${this.config.interval + 'ms'}`);
      this.interval = setInterval(async () => {
        if (this.isRunning) {
          await this.runIteration();
        }
      }, this.config.interval);
    } else {
      Logger.info("Running in one-time mode");
      this.stop();
    }
  }

  public stop() {
    if (!this.isRunning) {
      Logger.warn("Agent is not running");
      return;
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Wait for any running iteration to complete
    if (this.isIterationRunning) {
      Logger.info("Waiting for current iteration to complete...");
      const checkInterval = setInterval(() => {
        if (!this.isIterationRunning) {
          clearInterval(checkInterval);
          Logger.success("Stopped Foil trading agent");
        }
      }, 100);
    } else {
      Logger.success("Stopped Foil trading agent");
    }
  }
} 