import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

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
      The agent's current positions are available in the state.`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.nodeTransition(state.currentStep, 'Discover');
      Logger.step('[Discover] 🔍 Searching for market opportunities...');
      
      const response = await this.invokeModel(state, this.getPrompt(state));
      const formattedContent = this.formatMessageContent(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('[Discover] 🛠️ Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
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
        } else {
          Logger.warn(chalk.yellow('⚠️ No market data found in tool results'));
        }

        // Generate final analysis response
        const analysisPrompt = `Based on the market data we've gathered, provide a brief analysis of the opportunities found. 
        Focus on key metrics like liquidity, spreads, and trading activity. Keep it concise but informative.`;
        
        const analysisResponse = await this.invokeModel({
          ...state,
          messages: [...state.messages, agentResponse, ...toolResults]
        }, analysisPrompt);
        
        const analysisContent = this.formatMessageContent(analysisResponse.content);
        const analysisMessage = new AgentAIMessage(analysisContent);

        return this.createStateUpdate(state, [agentResponse, ...toolResults, analysisMessage], toolResults);
      }

      Logger.step('[Discover] ℹ️ No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in DiscoverMarketsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Discover] 🔄 Checking if more discovery needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info(chalk.cyan("[Discover] 🛠️ Tool calls found, continuing with tools"));
      return "tools";
    }

    // Always move to summary after discovery
    Logger.info(chalk.green("[Discover] ✅ Discovery complete, moving to summary"));
    return "publish_summary";
  }
} 