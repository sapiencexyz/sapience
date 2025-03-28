import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, AIMessage, HumanMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { z } from "zod";
import chalk from 'chalk';
import { LookupNode } from "../nodes";

// Define the state schema
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  toolResults: z.record(z.any()).optional(),
  positions: z.array(z.any()),
  markets: z.array(z.any()),
  actions: z.array(z.any()),
  currentStep: z.string(),
  lastAction: z.string().optional(),
  agentAddress: z.string()
});

type AgentGraphState = z.infer<typeof agentStateSchema>;

export class FoilAgent {
  private model: ChatAnthropic;
  private isRunning: boolean = false;
  private state: AgentGraphState | null = null;
  private tools: any[];
  private lookupNode: LookupNode;

  constructor(
    private config: AgentConfig,
    private agentTools: AgentTools,
    private agentAddress: string
  ) {
    Logger.setDebugMode(false);
    Logger.info("Initializing FoilAgent...");
    
    // Initialize Claude model with verbose logging disabled
    this.model = new ChatAnthropic({
      modelName: "claude-3-opus-20240229",
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

    // Initialize lookup node
    this.lookupNode = new LookupNode(config, agentTools, agentAddress);
  }

  private async initializeState(): Promise<AgentGraphState> {
    return {
      messages: [],
      toolResults: {},
      currentStep: 'settle',
      positions: [],
      markets: [],
      actions: [],
      agentAddress: this.agentAddress
    };
  }

  private async processStep(step: string): Promise<void> {
    try {
      this.state = await this.initializeState();
      Logger.info(`Starting ${step} step...`);

      // First, use lookup node to get positions
      const lookupState = await this.lookupNode.execute();
      this.state.positions = lookupState.positions;

      const systemPrompt = `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your current step is: ${step}
      
      Current state: ${JSON.stringify(this.state)}
      
      You have access to the following tools:

      readFoilContracts tools:
      - get_foil_market_info: Gets detailed information about a market's configuration
      - get_foil_epoch_info: Gets information about a specific period
      - get_foil_latest_period_info: Gets information about the most recent period
      - get_foil_token_owner: Gets the owner address of a specific position token
      - get_foil_token_by_index: Gets a position token ID by its index
      - get_foil_reference_price: Gets the reference price for a market
      - get_foil_position: Gets detailed information about a specific position
      - get_foil_sqrt_price: Gets the sqrt price for a specific period
      - get_foil_decimal_price_from_sqrt_price: Converts a sqrt price to a decimal price
      - get_foil_total_supply: Gets the total supply of Foil tokens
      - get_foil_balance_of: Gets the balance of Foil tokens for a specific holder

      writeFoilContracts tools:
      - quote_create_foil_trader_position: Gets a quote for creating a new trader position
      - create_foil_trader_position: Creates a new trader position
      - quote_modify_foil_trader_position: Gets a quote for modifying an existing trader position
      - modify_foil_trader_position: Modifies an existing trader position
      - quote_create_foil_liquidity_position: Gets a quote for creating a new liquidity position
      - create_foil_liquidity_position: Creates a new liquidity position
      - quote_modify_foil_liquidity_position: Gets a quote for modifying an existing liquidity position
      - modify_foil_liquidity_position: Modifies an existing liquidity position
      - settle_foil_position: Settles a position

      graphql tools:
      - get_foil_market: Gets detailed information about a specific market
      - list_foil_markets: Lists all available markets
      - get_foil_positions: Gets all positions
      - get_foil_resource: Gets detailed information about a specific resource
      - list_foil_resources: Lists all resources available in the Foil system
      - get_foil_periods: Gets information about periods
      - get_foil_transactions: Gets transaction information
      - get_foil_market_candles: Gets market candle data
      - get_foil_resource_candles: Gets resource candle data
      - get_foil_resource_trailing_average_candles: Gets trailing average candle data for a resource
      - get_foil_index_candles: Gets index candle data
      
      Each tool has specific parameters and requirements. Always check the tool descriptions before using them.
      
      For the ${step} step, you should:
      ${this.getStepInstructions(step)}
      
      IMPORTANT: You MUST use the appropriate tools to gather information and take actions. Do not just check the state.
      For each step, you should:
      1. Use tools to gather necessary information
      2. Analyze the information
      3. Take appropriate actions using tools
      4. Update the state with results

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
        new HumanMessage("Please execute the current step using the available tools.")
      ];

      let currentMessages = [...messages];
      let shouldContinue = true;

      while (shouldContinue) {
        // Get model response
        const response = await this.model.invoke(currentMessages);
        
        // Log the interaction
        Logger.modelInteraction([
          { role: 'system', content: `Executing ${step} step` },
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

    } catch (error) {
      Logger.error(`Error processing ${step} step: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private getStepInstructions(step: string): string {
    switch (step) {
      case 'lookup':
        return `1. Use get_foil_positions to get all positions
2. Filter positions to find those owned by the agent's address
3. Update state with found positions`;
      case 'settle':
        return `1. Use the positions from the lookup step
2. For each position:
   - Check if it needs settling (expired, reached target, etc.)
   - Use writeFoilContracts to settle positions that need it
3. Update state with settled positions and results`;
      case 'assess':
        return `1. Use the positions from the lookup step
2. Use graphql to get market conditions for each position
3. Analyze positions against market conditions
4. Use writeFoilContracts to modify positions if needed
5. Update state with assessment results`;
      case 'discover':
        return `1. Use graphql to scan all markets for opportunities
2. For promising markets:
   - Get detailed market data
   - Check liquidity and order book depth
3. Use readFoilContracts to verify market state
4. Update state with discovered opportunities`;
      default:
        return 'Unknown step';
    }
  }

  private async executeTradingLoop(): Promise<void> {
    const steps = ['lookup', 'settle', 'assess', 'discover'];
    let currentStepIndex = 0;

    while (this.isRunning) {
      const currentStep = steps[currentStepIndex];
      Logger.info(`Starting ${currentStep} step`);
      
      await this.processStep(currentStep);
      
      // Move to next step
      currentStepIndex = (currentStepIndex + 1) % steps.length;
      
      // Add delay between steps
      await new Promise(resolve => setTimeout(resolve, this.config.interval));
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
      
      await this.executeTradingLoop();
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