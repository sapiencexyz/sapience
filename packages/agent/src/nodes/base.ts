import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, MessageContent, BaseMessage, SystemMessage, ToolMessage, AIMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';
import { DynamicTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";

// Shared model instance
let sharedModel: Runnable | null = null;

export abstract class BaseNode {
  protected model: Runnable;
  protected nextNode?: string; // Default edge to follow

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    nextNode?: string
  ) {
    if (nextNode) {
      this.nextNode = nextNode;
    }
    
    if (!sharedModel) {
      // Convert our tools to LangChain tools
      const langChainTools = [
        ...convertToLangChainTools(this.tools.readFoilContracts),
        ...convertToLangChainTools(this.tools.writeFoilContracts),
        ...convertToLangChainTools(this.tools.graphql)
      ];

      Logger.info("Using Claude model");
      const claudeModel = new ChatAnthropic({
        modelName: "claude-3-7-sonnet-20250219",
        temperature: 0.1,
        anthropicApiKey: config.anthropicApiKey,
        maxTokens: 4096,
        streaming: false,
        verbose: false
      });
      
      // Wrap the model binding in a try/catch to handle potential errors
      try {
        sharedModel = claudeModel.bindTools(langChainTools);
      } catch (error) {
        Logger.error(`Error binding tools to model: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fallback to model without tools if binding fails
        sharedModel = claudeModel;
      }
    }
    this.model = sharedModel;
  }

  protected async invokeModel(state: AgentState, prompt: string): Promise<any> {
    try {
      // Log state changes in debug mode
      Logger.debug('Current state: ' + JSON.stringify(state, null, 2));

      // Create system message with agent role and capabilities
      const systemMessage = new SystemMessage({
        content: `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
        1. Settling positions when appropriate
        2. Assessing and modifying existing positions
        3. Discovering new market opportunities
        4. Publishing trading summaries
        
        You have access to the following tools:
        - readFoilContracts: Tools for reading market data, positions, and contract state
        - writeFoilContracts: Tools for modifying positions, settling trades, and interacting with the protocol
        - graphql: Tools for querying additional protocol data and market information
        
        Each tool has specific parameters and requirements. Always check the tool descriptions before using them.
        
        IMPORTANT: Use the exact tool names as shown in the tool descriptions. Do not use variations or camelCase versions.
        
        When using tools, format your response as:
        Thought: I need to [describe what you're going to do]
        Action: [tool name]
        Action Input: [tool parameters as JSON]
        Observation: [tool result]
        ... (repeat if needed)
        Thought: I now know [what you learned]
        Final Answer: [summary of what was done]`
      });

      // We expect state.messages to be either empty or contain only relevant messages
      // from the current node's execution (handled by execute method)
      const messages = state.messages;

      // Log the model interaction
      Logger.modelInteraction(
        [
          { role: 'system', content: systemMessage.content },
          ...messages.map(msg => ({ role: msg._getType(), content: msg.content })),
          { role: 'human', content: prompt }
        ],
        prompt
      );

      // Invoke model with messages
      const response = await this.model.invoke([
        systemMessage,
        ...messages,
        new HumanMessage(prompt)
      ]);
      
      return response;
    } catch (error) {
      Logger.error(`Error invoking model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  protected formatMessageContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    return JSON.stringify(content);
  }

  protected async handleToolCalls(toolCalls: any[]): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        // Find the tool in any of the tool categories
        const tool = Object.values(this.tools.readFoilContracts).find(t => t.name === toolCall.name) ||
                    Object.values(this.tools.writeFoilContracts).find(t => t.name === toolCall.name) ||
                    Object.values(this.tools.graphql).find(t => t.name === toolCall.name);

        if (tool) {
          Logger.info(chalk.magenta(`🛠️ Calling ${toolCall.name}`));
          const result = await tool.function(toolCall.args);
          Logger.info(chalk.magenta(`✓ Tool ${toolCall.name} completed`));
          
          // Format tool input/output for logging in purple
          const inputStr = JSON.stringify(toolCall.args);
          const outputStr = JSON.stringify(result);
          Logger.info(chalk.magenta(`📥 Input: ${inputStr}`));
          Logger.info(chalk.magenta(`📤 Output: ${outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr}`));
          
          results.push(new ToolMessage(JSON.stringify(result), toolCall.id));
        }
      } catch (error) {
        Logger.error(`Error executing tool ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.push(new ToolMessage(
          JSON.stringify({ error: 'Tool execution failed' }),
          toolCall.id
        ));
      }
    }
    
    return results;
  }

  protected createStateUpdate(state: AgentState, messages: BaseMessage[], toolResults: ToolMessage[] = []): AgentState {
    return {
      ...state,
      messages: messages, // Replace all messages with the new ones
      toolResults: {
        ...state.toolResults,
        ...toolResults.reduce((acc, msg) => ({
          ...acc,
          [msg.name]: msg.content
        }), {})
      }
    };
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      // Log state update at start of execution
      Logger.stateUpdate(this.constructor.name, {
        step: state.currentStep,
        lastAction: state.lastAction
      });

      // Start with a fresh message history for each node
      // This prevents tool ID mismatches between different nodes
      const cleanState = {
        ...state,
        messages: [] // Clear messages from previous nodes
      };

      // Check if we're returning from a tool call
      const isReturningFromToolCall = state.messages.some(msg => msg._getType() === 'tool');

      // Get node-specific prompt
      const prompt = this.getPrompt(cleanState);
      
      // If we're returning from tool calls, include a note about this in the logs
      if (isReturningFromToolCall) {
        Logger.info(chalk.blue(`Re-prompting ${this.constructor.name} with tool results`));
      }
      
      // Invoke model with prompt
      const response = await this.invokeModel(cleanState, prompt);
      const formattedContent = this.formatMessageContent(response.content);
      
      // Log the agent's response with the updated format
      Logger.info(chalk.green('AGENT:'));
      Logger.info(chalk.green(formattedContent));
      
      const agentResponse = new AIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Return a state with only the current conversation
        // This ensures tool IDs always match their corresponding tool_use
        return {
          ...cleanState,
          messages: [agentResponse, ...toolResults],
          toolResults: {
            ...cleanState.toolResults,
            ...toolResults.reduce((acc, msg) => ({
              ...acc,
              [msg.name]: msg.content
            }), {})
          }
        };
      }

      // Process the response (allow nodes to customize response handling)
      const processedState = await this.processResponse(cleanState, agentResponse);
      if (processedState) {
        return processedState;
      }

      return {
        ...cleanState,
        messages: [agentResponse],
        toolResults: cleanState.toolResults
      };
    } catch (error) {
      Logger.error(`Error in ${this.constructor.name}:`);
      if (error instanceof Error) {
        Logger.error(`Error message: ${error.message}`);
        if (error.stack) {
          Logger.error(`Stack trace: ${error.stack}`);
        }
      }
      throw error;
    }
  }

  /**
   * Override this method to customize how regular responses (without tool calls) are processed
   * Return null/undefined to use default processing behavior
   */
  protected async processResponse(
    state: AgentState, 
    response: AIMessage
  ): Promise<AgentState | null> {
    return null;
  }

  /**
   * Override this method to customize how tool results are processed
   * Return null/undefined to use default processing behavior
   */
  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    return null;
  }
  
  /**
   * Helper method to format tool results for inclusion in prompts
   * Nodes can use this in their getPrompt implementation to include tool results
   */
  protected formatToolResultsForPrompt(state: AgentState): string {
    const hasToolResults = Object.keys(state.toolResults || {}).length > 0;
    
    if (!hasToolResults) {
      return '';
    }
    
    return `\n\nYou have the following tool results:
    ${JSON.stringify(state.toolResults, null, 2)}
    
    Review these results carefully before responding. Use the information from these results
    to inform your response and complete the task requested in the prompt above.`;
  }

  /**
   * Determine the next node to execute.
   * If a node uses tools, it should return "tools".
   * Otherwise, it can return the next node id or use the default nextNode if defined.
   */
  async shouldContinue(state: AgentState): Promise<string> {
    // Check if the last message has tool calls
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info(chalk.cyan(`[${this.constructor.name}] 🛠️ Tool calls found, continuing with tools`));
      return "tools";
    }
    
    // If the node has defined a default next node, use it
    if (this.nextNode) {
      Logger.info(chalk.green(`[${this.constructor.name}] ✅ Using default edge to ${this.nextNode}`));
      return this.nextNode;
    }
    
    // Subclasses must implement this method if they don't set nextNode
    throw new Error(`${this.constructor.name} must implement shouldContinue or set nextNode`);
  }

  abstract getPrompt(state: AgentState): string;
} 