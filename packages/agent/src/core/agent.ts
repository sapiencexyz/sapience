import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { AgentConfig, AgentTools, AgentState } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { convertToLangChainTools } from '../types/index.js';
import { LookupNode, DiscoverMarketsNode } from "../nodes";
import chalk from 'chalk';

export class FoilAgent {
  private model: ChatAnthropic;
  private isRunning: boolean = false;
  private state: AgentState | null = null;
  private tools: any[];
  private lookupNode: LookupNode;
  private discoverNode: DiscoverMarketsNode;

  constructor(
    private config: AgentConfig,
    private agentTools: AgentTools,
    private agentAddress: string
  ) {
    Logger.setDebugMode(false);
    Logger.info("Initializing FoilAgent...");
    
    // Initialize Claude model with verbose logging disabled
    this.model = new ChatAnthropic({
      modelName: "claude-3-5-haiku-20241022",
      anthropicApiKey: config.anthropicApiKey,
      verbose: false
    });

    // Convert tools to LangChain format
    this.tools = [
      ...convertToLangChainTools(this.agentTools.readFoilContracts),
      ...convertToLangChainTools(this.agentTools.writeFoilContracts),
      ...convertToLangChainTools(this.agentTools.graphql)
    ];

    // Bind tools to the model and cast to correct type
    this.model = this.model.bind({ tools: this.tools }) as unknown as ChatAnthropic;

    // Initialize nodes
    this.lookupNode = new LookupNode(config, agentTools);
    this.discoverNode = new DiscoverMarketsNode(config, agentTools);
  }

  private async initializeState(): Promise<AgentState> {
    return {
      messages: [],
      positions: [],
      markets: [],
      actions: [],
      currentStep: 'lookup',
      toolResults: {},
      agentAddress: this.agentAddress
    };
  }

  private async runTradingLoop(): Promise<void> {
    try {
      // Initialize state if needed
      if (!this.state) {
        this.state = await this.initializeState();
      }

      // Run lookup step
      Logger.info("Starting lookup step");
      const lookupState = await this.lookupNode.execute(this.state);
      
      // Check if any positions were found
      if (!lookupState.positions || lookupState.positions.length === 0) {
        Logger.info("No positions found, skipping to discover step");
        Logger.nodeTransition('Lookup', 'Discover');
        this.state = {
          messages: lookupState.messages,
          positions: [],
          markets: [],
          actions: [],
          currentStep: 'discover',
          toolResults: lookupState.toolResults,
          agentAddress: lookupState.agentAddress
        };

        // Run discover step
        Logger.info("Starting discover step");
        const discoverState = await this.discoverNode.execute(this.state);
        this.state = discoverState;
        return;
      }

      // Update state with lookup results
      this.state = {
        messages: lookupState.messages,
        positions: lookupState.positions,
        markets: [],
        actions: [],
        currentStep: 'settle',
        toolResults: lookupState.toolResults,
        agentAddress: lookupState.agentAddress
      };
    } catch (error) {
      Logger.error(`Error in trading loop: ${error}`);
      throw error;
    }
  }

  public async start() {
    if (this.isRunning) {
      Logger.warn("Agent is already running");
      return;
    }

    this.isRunning = true;
    Logger.info("Starting Foil trading agent...");

    try {
      this.state = await this.initializeState();
      Logger.info("Starting trading loop...");
      
      await this.runTradingLoop();
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