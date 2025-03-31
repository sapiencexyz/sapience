import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { SystemMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';

export class AssessPositionsNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for assessing positions.
      
      You have access to the following tools:
      - get_foil_position: Gets information about a specific position
      
      Your task is to:
      1. Analyze each position in the state
      2. Evaluate risk and potential returns
      3. Make recommendations for position management
      
      IMPORTANT: Consider the agent's risk parameters when evaluating positions.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Assess] Reviewing positions...');
      
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
      Logger.error(`Error in AssessPositionsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 