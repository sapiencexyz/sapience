import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, BaseMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';
import { AgentAIMessage, AgentToolMessage } from '../types/message';
import { DynamicTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";

export abstract class BaseNode {
  protected model: Runnable<BaseMessage[], AIMessage>;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    // Convert our tools to LangChain tools
    const langChainTools = Object.values(tools.readFoilContracts).concat(
      Object.values(tools.writeFoilContracts),
      Object.values(tools.graphql)
    ).map(tool => new DynamicTool({
      name: tool.name,
      description: tool.description,
      func: async (input: string) => {
        try {
          const args = input ? JSON.parse(input) : {};
          const result = await tool.function(args);
          return JSON.stringify(result);
        } catch (error) {
          return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    }));

    this.model = new ChatAnthropic({
      modelName: config.model ?? "claude-3-sonnet-20240229",
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens ?? 4096,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    }).bindTools(langChainTools);
  }

  protected async invokeModel(messages: BaseMessage[]): Promise<AIMessage> {
    return this.model.invoke(messages);
  }

  /**
   * Execute the node's logic
   * @param state Current state of the agent
   * @returns Updated state after execution
   */
  async invoke(state: AgentState): Promise<AgentState> {
    try {
      // Log state update at start of execution
      Logger.stateUpdate(this.constructor.name, {
        step: state.currentStep,
        lastAction: state.lastAction
      });

      // Check if we're returning from a tool call
      const isReturningFromToolCall = state.messages.some(msg => msg._getType() === 'tool');

      // Get node-specific prompt
      const prompt = this.getPrompt(state);
      
      // If we're returning from tool calls, include a note about this in the logs
      if (isReturningFromToolCall) {
        Logger.info(chalk.blue(`Re-prompting ${this.constructor.name} with tool results`));
      }
      
      // Invoke model with all messages including the new prompt
      const messages = [...state.messages, prompt];
      const response = await this.invokeModel(messages);
      const formattedContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      // Log the system prompt
      Logger.info(chalk.blue('SYSTEM:'));
      Logger.info(chalk.blue(prompt.content));
      
      // Log the agent's response with the updated format
      Logger.info(chalk.green('AGENT:'));
      Logger.info(chalk.green(formattedContent));
      
      // Create the agent response message
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);
      
      // If there are tool calls, handle them immediately
      if (response.tool_calls?.length > 0) {
        const toolResults = await this.handleToolCalls(response.tool_calls);
        // Create new state with both the agent's response and tool results
        const updatedState = this.createStateUpdate(state, [agentResponse, ...toolResults]);
        
        // Only re-prompt if we haven't already processed these tool results
        const lastToolResult = toolResults[toolResults.length - 1];
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage instanceof AgentToolMessage && 
            lastMessage.content === lastToolResult.content) {
          // We've already processed these results, don't re-prompt
          return updatedState;
        }
        
        // Add a flag to indicate we should re-prompt this node
        return {
          ...updatedState,
          shouldRePrompt: true
        };
      }
      
      // Create new state with just the agent's response
      return this.createStateUpdate(state, [agentResponse]);
    } catch (error) {
      Logger.error(`Error in ${this.constructor.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get the prompt for this node
   * @param state Current state of the agent
   * @returns Prompt message
   */
  protected abstract getPrompt(state: AgentState): BaseMessage;

  /**
   * Format the message content for this node
   * @param content Raw content from the model
   * @returns Formatted content
   */
  protected formatMessageContent(content: string): string {
    return content;
  }

  /**
   * Create a new state with updated messages
   * @param state Current state
   * @param messages New messages to add
   * @returns Updated state
   */
  protected createStateUpdate(state: AgentState, messages: BaseMessage[]): AgentState {
    return {
      ...state,
      messages: [...state.messages, ...messages]
    };
  }

  /**
   * Execute the node's logic
   * @param state Current state of the agent
   * @returns Updated state after execution
   */
  public async execute(state: AgentState): Promise<AgentState> {
    try {
      // Use the base class's invoke method which handles the model interaction
      const updatedState = await this.invoke(state);

      // Handle tool calls if present in the updated state
      const lastMessage = updatedState.messages[updatedState.messages.length - 1];
      if (lastMessage instanceof AgentAIMessage && lastMessage.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(lastMessage.tool_calls);
        
        // Update state with tool results
        return this.createStateUpdate(updatedState, toolResults);
      }

      return updatedState;
    } catch (error) {
      Logger.error(`Error in ${this.constructor.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle tool calls from the model
   * @param toolCalls Array of tool calls to execute
   * @returns Array of tool result messages
   */
  protected async handleToolCalls(toolCalls: any[]): Promise<AgentToolMessage[]> {
    const toolResults: AgentToolMessage[] = [];
    
    for (const toolCall of toolCalls) {
      const tool = this.tools.readFoilContracts[toolCall.name] || 
                  this.tools.writeFoilContracts[toolCall.name] ||
                  this.tools.graphql[toolCall.name];

      if (!tool) {
        throw new Error(`Tool ${toolCall.name} not found`);
      }

      // Execute the tool
      Logger.info(chalk.magenta(`Executing tool: ${toolCall.name}`));
      Logger.info(chalk.magenta(`Tool args: ${JSON.stringify(toolCall.args, null, 2)}`));
      
      const result = await tool.function(toolCall.args);
      
      // Log the tool result
      Logger.info(chalk.magenta(`Tool result: ${JSON.stringify(result, null, 2)}`));
      
      // Add tool result to messages with the corresponding tool_call_id
      toolResults.push(new AgentToolMessage(JSON.stringify(result), toolCall.id));
    }

    return toolResults;
  }

  /**
   * Determine the next node to execute
   * @param state Current state of the agent
   * @returns ID of the next node to execute
   */
  async shouldContinue(state: AgentState): Promise<string> {
    // If we have a flag to re-prompt, stay on the current node
    if (state.shouldRePrompt) {
      return state.currentStep;
    }

    // Check if model wants to use tools
    const lastMessage = state.messages[state.messages.length - 1];
    if ((lastMessage as AIMessage).tool_calls?.length > 0) {
      Logger.step(`[${this.constructor.name}] Tool calls found, continuing with tools`);
      return "tools";
    }
    
    // Default behavior: move to the next node in the sequence
    switch (state.currentStep) {
      case "lookup":
        return state.positions?.length > 0 ? "settle_positions" : "discover_markets";
      case "settle_positions":
        return "assess_positions";
      case "assess_positions":
        return "discover_markets";
      case "discover_markets":
        return "publish_summary";
      case "publish_summary":
        return "delay";
      case "delay":
        return "lookup";
      default:
        return "__end__";
    }
  }
} 