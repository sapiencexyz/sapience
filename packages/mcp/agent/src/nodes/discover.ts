import { SystemMessage } from "@langchain/core/messages";
import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';

export class DiscoverMarketsNode extends BaseNode {
  async execute(state: AgentState): Promise<AgentState> {
    Logger.step('[Discover] Searching for market opportunities...');
    
    const prompt = `You are a Foil trading agent. Your task is to discover and analyze market opportunities using the provided tools.
      You have access to these tools:
      - get_foil_market_info: Get information about a specific market
      - get_foil_latest_period_info: Get the latest period information
      - quote_create_foil_trader_position: Get a quote for creating a new position
      - create_foil_trader_position: Create a new position
      
      Current state:
      - Step: ${state.currentStep}
      - Last action: ${state.lastAction || 'None'}
      - Number of markets: ${state.markets?.length || 0}
      
      Instructions:
      1. Use get_foil_market_info to analyze available markets
      2. For promising markets, use get_foil_latest_period_info to check current conditions
      3. If a market looks good, use quote_create_foil_trader_position first
      4. If the quote looks good, use create_foil_trader_position
      5. Explain your reasoning and actions clearly
      
      Respond with your analysis and planned actions.`;
    
    const response = await this.model.invoke([
      ...state.messages,
      new SystemMessage(prompt)
    ]);

    Logger.messageBlock([
      { role: 'system', content: prompt },
      { role: 'agent', content: response.content }
    ]);

    return {
      messages: [...state.messages, response],
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

    const discoveryMessages = state.messages.filter(m => 
      m.content.includes("Discovering new markets")
    );
    const result = discoveryMessages.length < 5 ? "discover_markets" : "publish_summary";
    Logger.info(`Discovery check result: ${result}`);
    return result;
  }
} 