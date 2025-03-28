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
      sharedModel = claudeModel.bindTools(langChainTools);
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
        Final Answer: [summary of what was done]
        
        Current State:
        - Step: ${state.currentStep}
        - Positions: ${JSON.stringify(state.positions, null, 2)}
        - Markets: ${JSON.stringify(state.markets, null, 2)}
        - Actions: ${JSON.stringify(state.actions, null, 2)}
        - Last Action: ${state.lastAction || 'none'}`
      });

      // Filter out any existing system messages from state.messages
      const nonSystemMessages = state.messages.filter(msg => msg._getType() !== 'system');

      // Log the model interaction
      Logger.modelInteraction(
        [
          { role: 'system', content: systemMessage.content },
          ...nonSystemMessages.map(msg => ({ role: msg._getType(), content: msg.content })),
          { role: 'human', content: prompt }
        ],
        prompt
      );

      // Invoke model with messages
      const response = await this.model.invoke([
        systemMessage,
        ...nonSystemMessages,
        new HumanMessage(prompt)
      ]);

      // We no longer log the thinking process separately, it will be part of AGENT OUTPUT
      
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
      messages: [...state.messages, ...messages],
      currentStep: state.currentStep,
      lastAction: state.lastAction,
      positions: state.positions,
      markets: state.markets,
      previousMarkets: state.markets,
      actions: state.actions,
      toolResults: {
        ...state.toolResults,
        ...toolResults.reduce((acc, msg) => ({
          ...acc,
          [msg.name]: msg.content
        }), {})
      },
      agentAddress: state.agentAddress
    };
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      // Log state update at start of execution
      Logger.stateUpdate(this.constructor.name, {
        step: state.currentStep,
        lastAction: state.lastAction
      });

      // Get node-specific prompt
      const prompt = this.getPrompt(state);
      
      // Invoke model with prompt
      const response = await this.invokeModel(state, prompt);
      const formattedContent = this.formatMessageContent(response.content);
      
      // Log the agent's response with the updated format
      Logger.info(chalk.green('AGENT:'));
      Logger.info(chalk.green(formattedContent));
      
      const agentResponse = new AIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        Logger.step('Processing tool calls...');
        const toolResults = await this.handleToolCalls(response.tool_calls);
        
        // Clear state messages to prevent tool ID mismatches
        // We'll still keep all relevant information in our new state
        const cleanState = {
          ...state,
          messages: [] // Clear message history to avoid tool ID conflicts
        };
        
        // Process further tool results if needed (this allows nodes to customize post-tool processing)
        const processedState = await this.processToolResults(
          cleanState, 
          agentResponse,
          toolResults
        );
        
        if (processedState) {
          return processedState;
        }

        // Default behavior: Simply update state with the tool results
        // This avoids making another model call which could cause tool ID mismatches
        return this.createStateUpdate(cleanState, [agentResponse, new AIMessage(`Analyzed data from ${toolResults.length} tool calls.`)], toolResults);
      }

      // Process the response (allow nodes to customize response handling)
      const processedState = await this.processResponse(state, agentResponse);
      if (processedState) {
        return processedState;
      }

      return this.createStateUpdate(state, [agentResponse]);
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