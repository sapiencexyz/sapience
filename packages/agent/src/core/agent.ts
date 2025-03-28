import { AgentConfig, AgentTools, AgentState } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import chalk from 'chalk';
import { GraphManager } from './graph.js';
import { 
  LookupNode, 
  DiscoverMarketsNode, 
  SettlePositionsNode, 
  AssessPositionsNode, 
  PublishSummaryNode,
  ToolsNode 
} from "../nodes/index.js";

export class FoilAgent {
  private isRunning: boolean = false;
  private state: AgentState | null = null;
  private graphManager: GraphManager;

  constructor(
    private config: AgentConfig,
    private agentTools: AgentTools,
    private agentAddress: string
  ) {
    Logger.setDebugMode(false);
    Logger.info("Initializing FoilAgent...");
    
    // Initialize graph manager using the factory method
    this.graphManager = GraphManager.createAgentGraph(config, agentTools);
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
      
      // Execute the graph starting from the lookup node
      this.state = await this.graphManager.execute('lookup', this.state);
      
      Logger.success("Trading loop completed");
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