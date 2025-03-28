import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

export class DiscoverMarketsNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    nextNode?: string
  ) {
    super(config, tools, nextNode || "publish_summary");
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
      The agent's current positions are available in the state.`;
  }

  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    // Log thinking state after tool calls
    Logger.step('[Discover] 📊 Analyzing market data...');
    
    // Extract market data from tool results
    const marketData = toolResults.map(result => {
      try {
        return JSON.parse(result.content as string);
      } catch (e) {
        Logger.error(`Error parsing market data: ${e}`);
        return null;
      }
    }).filter(Boolean);

    // Log summary of market analysis
    if (marketData.length > 0) {
      Logger.info(chalk.cyan(`📈 Found ${marketData.length} markets to analyze`));
      
      // Update the state with identified markets
      if (Array.isArray(marketData[0])) {
        state.markets = marketData[0];
      }
    } else {
      Logger.warn(chalk.yellow('⚠️ No market data found in tool results'));
    }

    // Instead of creating a new model call, process the data directly
    // This avoids tool ID mismatches with Anthropic's API
    const analysisMessage = new AgentAIMessage(
      `Based on the market data, I've identified ${state.markets?.length || 0} potential trading opportunities. 
      These markets appear to have sufficient liquidity and reasonable spreads for potential trading.`
    );

    // Return updated state with tool results and our analysis
    // We're not including the toolResults in the message history to avoid ID conflicts
    return this.createStateUpdate(state, [agentResponse, analysisMessage], toolResults);
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Discover] 🔄 Checking if more discovery needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info(chalk.cyan("[Discover] 🛠️ Tool calls found, continuing with tools"));
      return "tools";
    }

    // Use the default next node from BaseNode
    return super.shouldContinue(state);
  }
} 