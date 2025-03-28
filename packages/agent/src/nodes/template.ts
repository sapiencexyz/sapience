import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

/**
 * Template Node that demonstrates best practices for node implementation
 * This shows how to implement a node with the minimum required code
 */
export class TemplateNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    // Add any additional parameters needed by this specific node
    private customParam?: string
  ) {
    super(config, tools);
  }

  /**
   * Required: Provide the prompt for this node
   * This is the only method that MUST be implemented for a functioning node
   */
  public getPrompt(state: AgentState): string {
    return `You are a template node demonstrating best practices.
    
    You have access to the following tools:
    - tool_one: Description of tool one
    - tool_two: Description of tool two
    
    Your task is to:
    1. Review the current state
    2. Decide on the appropriate action
    3. Execute the action using available tools
    
    IMPORTANT: Use tools only when necessary.
    ${this.customParam ? `Custom parameter: ${this.customParam}` : ''}`;
  }

  /**
   * Optional: Process tool results (when the AI uses tools)
   * Override this method only if you need custom processing of tool results
   */
  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    // Example custom processing:
    Logger.step('[Template] Processing tool results...');
    
    // Example analysis of tool results
    const analysisPrompt = `Based on the tool results, what should we do next?`;
    
    const analysisResponse = await this.invokeModel({
      ...state,
      messages: [...state.messages, agentResponse, ...toolResults]
    }, analysisPrompt);
    
    const analysisContent = this.formatMessageContent(analysisResponse.content);
    const analysisMessage = new AgentAIMessage(analysisContent);

    return this.createStateUpdate(state, [agentResponse, ...toolResults, analysisMessage], toolResults);
  }

  /**
   * Optional: Process regular AI responses (when the AI doesn't use tools)
   * Override this method only if you need custom processing of regular responses
   */
  protected async processResponse(
    state: AgentState, 
    response: AIMessage
  ): Promise<AgentState | null> {
    Logger.step('[Template] Processing response...');
    
    // Example custom processing
    const customMessage = new AgentAIMessage(`Additional context added by template node`);
    
    return this.createStateUpdate(state, [response, customMessage]);
  }

  /**
   * Required: Determine the next node to execute
   * This method controls the flow of the agent's execution graph
   */
  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Template] Determining next step...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    // Check if the AI requested to use tools
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info(chalk.cyan("[Template] Tool calls found, continuing with tools"));
      return "tools";
    }

    // Example conditional logic to determine next node
    if (state.positions && state.positions.length > 0) {
      Logger.info(chalk.green("[Template] Positions found, moving to next step"));
      return "next_node_with_positions";
    } else {
      Logger.info(chalk.yellow("[Template] No positions found, taking alternative path"));
      return "alternative_node";
    }
  }
} 