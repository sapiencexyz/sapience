import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
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

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for discovering new markets.
      
      You have access to the following tools:
      - get_foil_markets: Gets all available markets
      - get_foil_market: Gets information about a specific market
      
      Your task is to:
      1. Get all available markets
      2. Filter for active markets
      3. Analyze market conditions
      4. Identify potential trading opportunities
      
      IMPORTANT: Consider the agent's risk parameters when evaluating markets.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Discover] Searching for markets...');
      
      const response = await this.invokeModel([this.getPrompt(state)]);
      const formattedContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Parse markets from tool results
        let markets = [];
        try {
          const lastToolResult = toolResults[toolResults.length - 1];
          const parsedResult = JSON.parse(lastToolResult.content as string);
          if (Array.isArray(parsedResult)) {
            markets = parsedResult.filter(market => market.isActive);
          }
        } catch (e) {
          Logger.error(`Error parsing markets: ${e}`);
        }

        // Update state with filtered markets
        const updatedState = this.createStateUpdate(state, [agentResponse, ...toolResults]);
        updatedState.markets = markets;

        return updatedState;
      }

      Logger.step('No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in DiscoverMarketsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 