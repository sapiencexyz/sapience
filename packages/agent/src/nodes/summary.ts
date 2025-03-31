import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { AIMessage, ToolMessage, SystemMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import chalk from 'chalk';

export class PublishSummaryNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): BaseMessage {
    const prompt = `You are a Foil trading agent responsible for publishing summaries.
      
      Your task is to:
      1. Review the current state
      2. Generate a summary of positions and actions
      3. Format the summary for publication
      
      IMPORTANT: Focus on key information and maintain a clear, concise format.`;
      
    return new HumanMessage(prompt);
  }

  protected formatToolResultsForPrompt(state: AgentState): string {
    const toolMessages = state.messages.filter(msg => msg._getType() === 'tool') as ToolMessage[];
    if (toolMessages.length === 0) return '';

    return '\n\nPrevious tool results:\n' + toolMessages
      .map(msg => `- ${msg.content}`)
      .join('\n');
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