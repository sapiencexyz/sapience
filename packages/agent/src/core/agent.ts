import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { z } from "zod";

// Define the state schema
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  toolResults: z.record(z.any()).optional(),
  positions: z.array(z.any()),
  markets: z.array(z.any()),
  actions: z.array(z.any()),
  currentStep: z.string()
});

type AgentGraphState = z.infer<typeof agentStateSchema>;

export class FoilAgent {
  private executor: AgentExecutor;
  private model: ChatAnthropic;
  private isRunning: boolean = false;
  private state: AgentState | null = null;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    Logger.setDebugMode(false);
    Logger.info("Initializing FoilAgent...");
    
    // Initialize Claude model
    this.model = new ChatAnthropic({
      modelName: "claude-3-opus-20240229",
      anthropicApiKey: config.anthropicApiKey
    });

    // Build the agent executor
    this.initializeExecutor();
  }

  private async initializeExecutor() {
    Logger.info("Creating new Agent Executor...");

    // Convert tools to LangChain format
    const langChainTools = [
      ...convertToLangChainTools(this.tools.readFoilContracts),
      ...convertToLangChainTools(this.tools.writeFoilContracts),
      ...convertToLangChainTools(this.tools.graphql)
    ];

    try {
      // Initialize the agent executor with tools and model
      this.executor = await initializeAgentExecutorWithOptions(
        langChainTools,
        this.model,
        {
          agentType: "structured-chat-zero-shot-react-description",
          verbose: true,
          agentArgs: {
            prefix: `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
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
          }
        }
      );

      Logger.success("Agent Executor initialized successfully");
    } catch (error) {
      Logger.error(`Failed to initialize agent executor: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async initializeState(): Promise<AgentGraphState> {
    return {
      messages: [],
      toolResults: {},
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
      await this.executor.invoke({
        input: "Initialize trading session and analyze current market conditions.",
        state: initialState
      });
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