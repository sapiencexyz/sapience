import { AgentConfig, AgentState, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { SystemMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import chalk from 'chalk';
import { AgentAIMessage } from '../types/message';

export class EvaluateMarketNode extends BaseNode {
  constructor(config: AgentConfig, tools: AgentTools) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for evaluating markets.
      
      You have access to the following tools:
      - get_foil_market: Gets information about a specific market
      
      Your task is to:
      1. Analyze market conditions
      2. Evaluate trading opportunities
      3. Make recommendations for market entry/exit
      
      IMPORTANT: Consider market conditions and risk parameters when evaluating opportunities.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Evaluate] Analyzing market...');
      
      const response = await this.invokeModel([this.getPrompt(state)]);
      const formattedContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Update state with tool results
        return this.createStateUpdate(state, [agentResponse, ...toolResults]);
      }

      Logger.step('No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in EvaluateMarketNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 