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
      Logger.nodeTransition('Start', 'Lookup');
      Logger.info("Starting position lookup...");

      const systemPrompt = `You are a Foil trading agent responsible for finding positions owned by the agent.
      
      You have access to the following tools:
      - get_foil_positions: Gets all positions
      
      Your task is to:
      1. Use get_foil_positions to get all positions
      2. Filter positions to find those owned by the agent's address: ${this.agentAddress}
      3. Update state with found positions
      
      IMPORTANT: The agent's address is already available in the state as agentAddress. Use this exact address to filter positions.
      Do not try to use placeholder addresses or modify the address in any way.
      
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
        new HumanMessage(`Please find all positions owned by the agent at address: ${this.agentAddress}`)
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
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Only process the first tool call
          const toolCall = response.tool_calls[0];
          const tool = this.tools.find(t => t.name === toolCall.name);
          
          if (tool) {
            // Add the model's response with tool calls first
            currentMessages.push(response);
            
            // Log tool call in purple
            Logger.info(chalk.magenta(`Calling ${toolCall.name}`));
            
            // Execute tool with empty input to get all positions
            const result = await tool.call({ input: "" });
            
            // Log tool completion in purple
            Logger.info(chalk.magenta(`Tool ${toolCall.name} completed`));
            
            // Format tool input/output for logging in purple
            const inputStr = JSON.stringify({ input: "" });
            const outputStr = JSON.stringify(result);
            Logger.info(chalk.magenta(`Tool ${toolCall.name} input: ${inputStr}`));
            Logger.info(chalk.magenta(`Tool ${toolCall.name} output: ${outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr}`));
            
            // Parse the result to get positions
            let positions = [];
            try {
              const parsedResult = JSON.parse(result);
              if (Array.isArray(parsedResult)) {
                positions = parsedResult.filter(pos => pos.owner.toLowerCase() === this.agentAddress.toLowerCase());
                
                // Log the agent's reasoning
                Logger.info(chalk.green('AGENT: <thinking>'));
                if (positions.length === 0) {
                  Logger.info(chalk.green('No positions found for the agent address. Will transition to discover step.'));
                } else {
                  Logger.info(chalk.green(`Found ${positions.length} positions owned by the agent. Will transition to settle step.`));
                }
                Logger.info(chalk.green('</thinking>'));
              }
            } catch (e) {
              Logger.error(`Error parsing positions: ${e}`);
            }

            // Update state with filtered positions
            if (this.state) {
              this.state.positions = positions;
              this.state.toolResults = {
                ...this.state.toolResults,
                [toolCall.name]: result
              };
            }

            // Add the tool result to the conversation with the correct tool call ID
            currentMessages.push(new ToolMessage(result, toolCall.id));
            
            // Get the model's response to the tool result
            const toolResponse = await this.model.invoke(currentMessages);
            
            // Log the agent's response to the tool output
            Logger.info(chalk.green('AGENT: <thinking>'));
            // Extract just the reasoning part from the response
            const content = typeof toolResponse.content === 'string' 
              ? toolResponse.content 
              : JSON.stringify(toolResponse.content);
            const reasoning = content.match(/Thought: (.*?)(?:\n|$)/)?.[1] || content;
            Logger.info(chalk.green(reasoning));
            Logger.info(chalk.green('</thinking>'));
            
            currentMessages.push(toolResponse);

            // We're done with this tool call
            shouldContinue = false;
          }
        } else {
          // If no more tool calls, we're done
          shouldContinue = false;
        }
      }

      return this.state;
    } catch (error) {
      Logger.error(`Error in lookup node: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 