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
    let prompt = `Create a comprehensive summary of the trading session. Make it a 3-5 tweet thread in the style of Matt Levine.`;
    
    // Add tool results if available
    prompt += this.formatToolResultsForPrompt(state);
    
    return prompt;
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