import { SystemMessage } from "@langchain/core/messages";
import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class DiscoverMarketsNode extends BaseNode {
  async execute(state: AgentState): Promise<AgentState> {
    Logger.step('[Discover] Searching for market opportunities...');
    
    const prompt = `Discover and analyze market opportunities using the provided tools.
      You have access to these tools:
      - getMarketInfo: Get information about a specific market
      - getLatestEpochInfo: Get the latest period information
      - quoteCreateTraderPosition: Get a quote for creating a new position
      - createTraderPosition: Create a new position
      
      Current state:
      - Step: ${state.currentStep}
      - Last action: ${state.lastAction || 'None'}
      - Number of markets: ${state.markets?.length || 0}
      
      Instructions:
      1. Use getMarketInfo to analyze available markets
      2. For promising markets, use getLatestEpochInfo to check current conditions
      3. If a market looks good, use quoteCreateTraderPosition first
      4. If the quote looks good, use createTraderPosition
      5. Explain your reasoning and actions clearly
      
      Respond with your analysis and planned actions.`;
    
    const response = await this.invokeModel(state, prompt);
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'discover_markets',
      lastAction: 'analyze_markets',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Discover] Checking if more discovery needed...');
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("Tool calls found, continuing with tools");
      return "tools";
    }

    // Check if we've made any market discoveries in this iteration
    const hasDiscoveredMarkets = state.markets?.length > 0;
    const result = hasDiscoveredMarkets ? "publish_summary" : "discover_markets";
    Logger.info(`Discovery check result: ${result}`);
    return result;
  }
} 