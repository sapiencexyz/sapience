import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class DiscoverMarketsNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  public getPrompt(state: AgentState): string {
    return `You are a Foil trading agent responsible for discovering market opportunities.
      
      You have access to the following tools:
      - list_foil_markets: Lists all available markets
      - get_foil_market: Gets detailed information about a specific market
      - get_foil_market_info: Gets detailed information about a market's configuration
      - get_foil_latest_period_info: Gets information about the most recent period
      
      Your task is to:
      1. Use list_foil_markets to get all available markets
      2. For each market:
         - Use get_foil_market to get detailed information
         - Use get_foil_latest_period_info to check current conditions
      3. Identify markets that are:
         - Active and trading
         - Have good liquidity
         - Have reasonable spreads
      4. Update state with promising markets
      
      IMPORTANT: Focus on finding markets where the agent doesn't already have positions.
      The agent's current positions are available in the state.
      
      When using tools, format your response as:
      Thought: I need to [describe what you're going to do]
      Action: [tool name]
      Action Input: [tool parameters as JSON]
      Observation: [tool result]
      ... (repeat if needed)
      Thought: I now know [what you learned]
      Final Answer: [summary of what was done]`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.nodeTransition(state.currentStep, 'Discover');
      Logger.step('[Discover] Searching for market opportunities...');
      
      const response = await this.invokeModel(state, this.getPrompt(state));
      const formattedContent = this.formatMessageContent(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('[Discover] Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Log thinking state after tool calls
        Logger.step('[Discover] Analyzing market data...');
        return this.createStateUpdate(state, [agentResponse, ...toolResults], toolResults);
      }

      Logger.step('[Discover] No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in DiscoverMarketsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Discover] Checking if more discovery needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("[Discover] Tool calls found, continuing with tools");
      return "tools";
    }

    // Check if we've made any market discoveries in this iteration
    const hasDiscoveredMarkets = state.markets?.length > 0;
    const hasNewMarkets = state.markets?.some(market => 
      !state.previousMarkets?.some(prevMarket => prevMarket.address === market.address)
    );

    if (hasNewMarkets) {
      Logger.info("[Discover] New markets discovered, continuing discovery");
      return "discover_markets";
    } else if (hasDiscoveredMarkets) {
      Logger.info("[Discover] No new markets found, moving to summary");
      return "publish_summary";
    } else {
      Logger.info("[Discover] No markets found, continuing discovery");
      return "discover_markets";
    }
  }
} 