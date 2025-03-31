import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';
import { ToolMessage } from '@langchain/core/messages';

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
      
      const updatedState = await this.invoke(state);

      const lastMessage = updatedState.messages[updatedState.messages.length - 1];
      
      if (lastMessage instanceof AgentAIMessage) {
        if (lastMessage.tool_calls?.length > 0) {
          Logger.step('Processing tool calls...');
          const toolResults = await this.handleToolCalls(lastMessage.tool_calls);
          
          let markets = [];
          try {
            const lastToolResult = toolResults[toolResults.length - 1];
            let marketDataJson: string | undefined;

            // Check if content is a string (less common for tool results)
            if (typeof lastToolResult.content === 'string') {
              marketDataJson = lastToolResult.content;
            } 
            // Check if content is an array (common case)
            else if (Array.isArray(lastToolResult.content)) {
              // Use a type predicate to find the text content part safely
              const textPart = lastToolResult.content.find(
                (part): part is { type: "text"; text: string } => part.type === "text"
              );
              if (textPart) {
                marketDataJson = textPart.text;
              }
            }

            // If we found a JSON string, parse and filter
            if (marketDataJson) {
              const parsedResult = JSON.parse(marketDataJson);
              if (Array.isArray(parsedResult)) {
                markets = parsedResult.filter(market => market.isActive !== undefined ? market.isActive : true); 
              }
            } else {
              Logger.warn('Could not find parsable market data in tool result content.');
            }

          } catch (e) {
            Logger.error(`Error parsing markets: ${e}`);
          }

          const finalState = this.createStateUpdate(updatedState, toolResults);
          finalState.markets = markets;
          
          if (markets.length === 0) {
            Logger.info(`No active markets found.`);
          } else {
            Logger.info(`Found ${markets.length} active markets.`);
          }

          return finalState;
        } else {
          Logger.step('No tool calls to process, returning state.');
          return updatedState;
        }
      }
      
      Logger.step('Last message not AgentAIMessage, returning current state.');
      return updatedState;

    } catch (error) {
      Logger.error(`Error in DiscoverMarketsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 