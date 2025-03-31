import { SystemMessage, HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

export class SettlePositionsNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for settling positions.
      
      You have access to the following tools:
      - settle_foil_position: Settles a specific position
      
      Your task is to:
      1. Review positions that need settlement
      2. Execute settlement transactions
      3. Update state with settled positions
      
      IMPORTANT: Only settle positions that meet the settlement criteria.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Settle] Processing positions...');
      
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
      Logger.error(`Error in SettlePositionsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 