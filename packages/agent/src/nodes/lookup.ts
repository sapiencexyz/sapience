import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { Logger } from "../utils/logger";
import { AgentConfig, AgentState, AgentTools } from "../types/agent";
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

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for finding positions owned by the agent.
      
      You have access to the following tools:
      - get_foil_positions: Gets all positions
      
      Your task is to:
      1. Use the get_foil_positions tool to get all positions
      2. Filter positions to find those owned by the agent's address: ${this.agentAddress}
      3. Update state with found positions
      
      IMPORTANT: 
      - Provide clear text responses explaining what you're doing at each step
      - Use the tools directly by calling them with the appropriate arguments
      - Do not write code or pseudo-code
      - The agent's address is already available in the state as agentAddress
      - Do not try to use placeholder addresses or modify the address in any way
      - After using tools, explain what you found and what you're doing next
      
      Please proceed with finding all positions owned by the agent.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Lookup] Searching for positions...');
      
      // Use the base class's invoke method which handles the model interaction
      const updatedState = await this.invoke(state);

      // Log all messages in the state for debugging
      Logger.info('Current state messages:');
      updatedState.messages.forEach((msg, index) => {
        Logger.info(`Message ${index}: ${msg.constructor.name}`);
        if (msg instanceof AgentAIMessage) {
          Logger.info(`Content: ${msg.content}`);
          Logger.info(`Tool calls: ${JSON.stringify(msg.tool_calls, null, 2)}`);
        }
      });

      // Log the agent's text response if present
      const lastMessage = updatedState.messages[updatedState.messages.length - 1];
      Logger.info(`Last message type: ${lastMessage.constructor.name}`);
      
      if (lastMessage instanceof AgentAIMessage) {
        // Log any text content from the agent
        if (lastMessage.content) {
          Logger.info(`AGENT RESPONSE: ${lastMessage.content}`);
        } else {
          Logger.info('No content in agent response');
        }

        // If there are tool calls, process them
        if (lastMessage.tool_calls?.length > 0) {
          Logger.step('Processing tool calls...');
          Logger.info(`Number of tool calls: ${lastMessage.tool_calls.length}`);
          lastMessage.tool_calls.forEach((call, index) => {
            Logger.info(`Tool call ${index}: ${call.name}`);
            Logger.info(`Tool call args: ${JSON.stringify(call.args, null, 2)}`);
          });
          
          const toolResults = await this.handleToolCalls(lastMessage.tool_calls);
          
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

          // Update state with filtered positions and tool results
          const finalState = this.createStateUpdate(updatedState, toolResults);
          finalState.positions = positions;
          
          // Log positions information
          if (positions.length === 0) {
            Logger.step(`No positions found for the agent address.`);
          } else {
            Logger.step(`Found ${positions.length} positions owned by the agent.`);
          }

          return finalState;
        } else {
          // If there are no tool calls, we're done with this node
          return updatedState;
        }
      }

      return updatedState;
    } catch (error) {
      Logger.error(`Error in LookupNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 