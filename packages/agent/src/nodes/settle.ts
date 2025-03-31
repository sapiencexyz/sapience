import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
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
      
      const response = await this.invokeModel([this.getPrompt(state)]);
      const formattedContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Update state with tool results
        const updatedState = this.createStateUpdate(state, [agentResponse, ...toolResults]);
        
        // Log settlement information
        Logger.step('Positions settled successfully.');
        
        return updatedState;
      }

      Logger.step('No tool calls to process, updating state...');
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in SettlePositionsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 