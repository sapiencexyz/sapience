import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { Logger } from "../utils/logger";
import { AgentConfig, AgentState, AgentTools, convertToLangChainTools } from "../types/agent";
import { z } from "zod";
import chalk from 'chalk';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { BaseNode } from "./base";
import { AgentAIMessage } from '../types/message';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the correct path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Define the state schema for lookup
const lookupStateSchema = z.object({
  messages: z.array(z.any()),
  toolResults: z.record(z.any()).optional(),
  positions: z.array(z.any()),
  agentAddress: z.string()
});

type LookupState = z.infer<typeof lookupStateSchema>;

export class LookupNode extends BaseNode {
  
  protected model: ChatAnthropic;
  private state: LookupState | null = null;
  private agentAddress: string;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
    
    Logger.setDebugMode(false);
    Logger.info("Initializing LookupNode...");
    
    // Get private key from environment variables
    const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETHEREUM_PRIVATE_KEY environment variable is not set');
    }

    // Get public key from private key using viem
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    this.agentAddress = account.address;
    Logger.info(`Agent address: ${this.agentAddress}`);
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Lookup] Checking if more lookup needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("[Lookup] Tool calls found, continuing with tools");
      return "tools";
    }

    // Check if we've found any positions
    const hasPositions = state.positions?.length > 0;
    if (hasPositions) {
      Logger.info("[Lookup] Positions found, moving to settle");
      return "settle";
    } else {
      Logger.info("[Lookup] No positions found, moving to discover");
      return "discover";
    }
  }

  private async initializeState(): Promise<LookupState> {
    return {
      messages: [],
      toolResults: {},
      positions: [],
      agentAddress: this.agentAddress
    };
  }

  public getPrompt(state: AgentState): string {
    return `You are a Foil trading agent responsible for finding positions owned by the agent.
      
      You have access to the following tools:
      - get_foil_positions: Gets all positions
      
      Your task is to:
      1. Use get_foil_positions to get all positions
      2. Filter positions to find those owned by the agent's address: ${this.agentAddress}
      3. Update state with found positions
      
      IMPORTANT: The agent's address is already available in the state as agentAddress. Use this exact address to filter positions.
      Do not try to use placeholder addresses or modify the address in any way.`;
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.nodeTransition(state.currentStep, 'Lookup');
      Logger.step('[Lookup] Searching for positions...');
      
      const response = await this.invokeModel(state, this.getPrompt(state));
      const formattedContent = this.formatMessageContent(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('[Lookup] Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Parse positions from tool results
        let positions = [];
        try {
          const lastToolResult = toolResults[toolResults.length - 1];
          const parsedResult = JSON.parse(lastToolResult.content as string);
          if (Array.isArray(parsedResult)) {
            positions = parsedResult.filter(pos => pos.owner.toLowerCase() === this.agentAddress.toLowerCase());
          }
        } catch (e) {
          Logger.error(`Error parsing positions: ${e}`);
        }

        // Update state with filtered positions
        const updatedState = this.createStateUpdate(state, [agentResponse, ...toolResults], toolResults);
        updatedState.positions = positions;
        
        // Log the agent's reasoning
        Logger.info(chalk.green('AGENT: <thinking>'));
        if (positions.length === 0) {
          Logger.info(chalk.green('No positions found for the agent address. Will transition to discover step.'));
        } else {
          Logger.info(chalk.green(`Found ${positions.length} positions owned by the agent. Will transition to settle step.`));
        }
        Logger.info(chalk.green('</thinking>'));

        return updatedState;
      }

      Logger.step('[Lookup] No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in LookupNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 