import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

/**
 * Template for creating new nodes
 * Copy this file and customize as needed
 */
export class TemplateNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    nextNode?: string
  ) {
    super(config, tools, nextNode || "default_next_node");
  }

  /**
   * Required: Provide the prompt for this node
   * This is the only method that MUST be implemented for a functioning node
   */
  public getPrompt(state: AgentState): string {
    // Create your node-specific prompt here
    let prompt = `You are a Foil trading agent responsible for [YOUR NODE'S TASK].
    
    You have access to the following tools:
    - tool_1: Description of tool 1
    - tool_2: Description of tool 2
    
    Your task is to:
    1. Task step 1
    2. Task step 2
    3. Task step 3
    
    IMPORTANT: Additional instructions or context.`;
    
    // Add tool results if available - this will include any tool results from previous steps
    // This is important for continuing a task after tool calls
    prompt += this.formatToolResultsForPrompt(state);
    
    return prompt;
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
    // Check if model wants to use tools
    const lastMessage = state.messages[state.messages.length - 1];
    if ((lastMessage as AIMessage).tool_calls?.length > 0) {
      Logger.step('[TemplateNode] Tool calls found, continuing with tools');
      return "tools";
    }
    
    // Node-specific logic to determine next step
    // ...
    
    // Use the default next node if no specific condition matches
    return super.shouldContinue(state);
  }
} 