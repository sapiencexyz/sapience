import { AgentConfig, AgentState, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { SystemMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
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
      
      const updatedState = await this.invoke(state);

      const lastMessage = updatedState.messages[updatedState.messages.length - 1];

      if (lastMessage instanceof AgentAIMessage) {
        if (lastMessage.tool_calls?.length > 0) {
          Logger.step('Tool calls processed by invoke method.');
          return updatedState;
        } else {
          Logger.step('No tool calls made in this step.');
          return updatedState;
        }
      } 
      
      Logger.step('Last message not AgentAIMessage or no message found, returning current state.');
      return updatedState;

    } catch (error) {
      Logger.error(`Error in EvaluateMarketNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 