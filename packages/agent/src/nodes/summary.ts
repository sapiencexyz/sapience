import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import chalk from 'chalk';

export class PublishSummaryNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    nextNode?: string
  ) {
    super(config, tools, nextNode || "delay");
  }

  public getPrompt(state: AgentState): string {
    return `Create a comprehensive summary of the trading session. Make it a 3-5 tweet thread in the style of Matt Levine.`;
  }

  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    Logger.step('Processing summary data...');
    
    // Process and log any useful data from tool results
    toolResults.forEach((result, index) => {
      try {
        const data = JSON.parse(result.content as string);
        Logger.step(`Tool ${index + 1} result processed`);
      } catch (e) {
        Logger.warn(`Could not parse tool result ${index + 1}`);
      }
    });
    
    // Instead of making another model call, directly create a summary message
    // This avoids tool ID mismatches with Anthropic's API
    const summaryMessage = new AgentAIMessage(
      `Trading Session Summary:
      
      1/ Today we explored the Foil markets, looking for trading opportunities in a fluctuating environment.
      
      2/ We've monitored ${state.markets?.length || 0} markets and currently manage ${state.positions?.length || 0} active positions.
      
      3/ As we continue to analyze the market conditions, we'll look for high-liquidity opportunities with reasonable spreads for our next moves.`
    );

    // Return updated state with our analysis but not including the toolResults 
    // in the message history to avoid ID conflicts
    return this.createStateUpdate(state, [agentResponse, summaryMessage], toolResults);
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('Determining next step...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.step('Tool calls found, continuing with tools');
      return "tools";
    }

    // Use the default next node from BaseNode
    return super.shouldContinue(state);
  }
} 