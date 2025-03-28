import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { Logger } from "../utils/logger";
import { AgentTools, convertToLangChainTools } from "../types/agent";
import { z } from "zod";
import chalk from 'chalk';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

export class LookupNode {
  private model: ChatAnthropic;
  private state: LookupState | null = null;
  private tools: any[];
  private agentAddress: string;

  constructor(
    private config: { anthropicApiKey: string },
    private agentTools: AgentTools
  ) {
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
    
    // Initialize Claude model with verbose logging disabled
    this.model = new ChatAnthropic({
      modelName: "claude-3-opus-20240229",
      anthropicApiKey: config.anthropicApiKey,
      verbose: false
    });

    // Convert tools to LangChain format
    this.tools = [
      ...convertToLangChainTools(this.agentTools.graphql)
    ];

    // Bind tools to the model and cast to correct type
    this.model = this.model.bind({ tools: this.tools }) as unknown as ChatAnthropic;
  }

  private async initializeState(): Promise<LookupState> {
    return {
      messages: [],
      toolResults: {},
      positions: [],
      agentAddress: this.agentAddress
    };
  }

  public async execute(): Promise<LookupState> {
    try {
      this.state = await this.initializeState();
      Logger.info("Starting position lookup...");

      const systemPrompt = `You are a Foil trading agent responsible for finding positions owned by the agent.
      
      Current state: ${JSON.stringify(this.state)}
      
      You have access to the following tools:
      - get_foil_positions: Gets all positions
      
      Your task is to:
      1. Use get_foil_positions to get all positions
      2. Filter positions to find those owned by the agent's address: ${this.agentAddress}
      3. Update state with found positions
      
      When using tools, format your response as:
      Thought: I need to [describe what you're going to do]
      Action: [tool name]
      Action Input: [tool parameters as JSON]
      Observation: [tool result]
      ... (repeat if needed)
      Thought: I now know [what you learned]
      Final Answer: [summary of what was done]`;

      // Create messages array with system prompt and a human message to trigger the agent
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage("Please find all positions owned by the agent.")
      ];

      let currentMessages = [...messages];
      let shouldContinue = true;

      while (shouldContinue) {
        // Get model response
        const response = await this.model.invoke(currentMessages);
        
        // Log the interaction
        Logger.modelInteraction([
          { role: 'system', content: 'Executing lookup step' },
          { role: 'assistant', content: response.content }
        ]);

        // Process any tool calls
        if (response.tool_calls) {
          for (const toolCall of response.tool_calls) {
            const tool = this.tools.find(t => t.name === toolCall.name);
            if (tool) {
              Logger.info(`Calling ${toolCall.name}`);
              const result = await tool.call(toolCall.args);
              Logger.info(`Tool ${toolCall.name} completed`);
              
              // Format tool input/output for logging
              const inputStr = JSON.stringify(toolCall.args);
              const outputStr = JSON.stringify(result);
              Logger.info(`Tool ${toolCall.name} input: ${inputStr.length > 200 ? inputStr.substring(0, 200) + '...' : inputStr}`);
              Logger.info(chalk.magenta(`Tool ${toolCall.name} output: ${outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr}`));
              
              // Add the tool result to the conversation with the correct tool call ID
              currentMessages.push(new ToolMessage(result, toolCall.id));
              
              // Update state with tool results
              if (this.state) {
                this.state.toolResults = {
                  ...this.state.toolResults,
                  [toolCall.name]: result
                };
              }
            }
          }
        } else {
          // If no more tool calls, we're done
          shouldContinue = false;
        }

        // Only add the model's response if we're done with tool calls
        if (!shouldContinue) {
          currentMessages.push(response);
        }
      }

      return this.state;
    } catch (error) {
      Logger.error(`Error in lookup node: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 