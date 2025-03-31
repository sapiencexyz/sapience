import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { SystemMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

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
      
      // Use the base class's invoke method
      const updatedState = await this.invoke(state);

      // Log the agent's text response if present
      const lastMessage = updatedState.messages[updatedState.messages.length - 1];

      if (lastMessage instanceof AgentAIMessage) {
        // If there were tool calls, they were handled by invoke and results added.
        // We just need to decide if further specific processing/state update is needed here.
        // In this node's case, it seems the primary goal is the analysis by the LLM,
        // potentially using tools, but not necessarily extracting structured data back into the main state fields.
        if (lastMessage.tool_calls?.length > 0) {
          // Tool calls were made and handled by the base invoke method.
          // The updatedState should contain the AI message, tool calls, tool results, and the final AI response.
          Logger.step('Tool calls processed by invoke method.');
          
          // If specific data needed parsing from toolResults, it would happen here.
          // For now, we assume the state returned by invoke is sufficient.
          return updatedState; 
        } else {
          Logger.step('No tool calls made in this step.');
          // No tool calls, state from invoke is final for this step.
          return updatedState;
        }
      } 
      
      Logger.step('Last message not AgentAIMessage or no message found, returning current state.');
      // Fallback if the last message isn't what we expect
      return updatedState;

    } catch (error) {
      Logger.error(`Error in AssessPositionsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return super.shouldContinue(state);
  }
} 