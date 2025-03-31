import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, BaseMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';
import { AgentAIMessage, AgentToolMessage } from '../types/message';
import { DynamicTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";
import { END } from "@langchain/langgraph";

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
      modelName: config.model ?? "claude-3-7-sonnet-20250219",
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

      // Check if the last message is a tool result
      const lastMessage = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
      const isReturningFromToolCall = lastMessage instanceof AgentToolMessage;

      // Prepare messages for the model
      let messagesToInvoke: BaseMessage[];
      let promptForLogging: BaseMessage | null = null; // To track which prompt to log

      if (isReturningFromToolCall) {
        Logger.info(chalk.blue(`Re-invoking ${this.constructor.name} with tool results. Using existing message history.`));
        // Just use existing messages; the last one is the tool result.
        messagesToInvoke = [...state.messages]; 
      } else {
        // Not returning from a tool call, so get and add the node-specific prompt.
        const prompt = this.getPrompt(state);
        promptForLogging = prompt; // Store the prompt for logging
        Logger.info(chalk.blue(`Invoking ${this.constructor.name} with new prompt.`));
        messagesToInvoke = [...state.messages, prompt];
      }
      
      // Invoke model with the prepared messages
      const response = await this.invokeModel(messagesToInvoke);
      
      // Log the interaction using the Logger class
      // Log the prompt only if one was added in this invocation
      const logMessages: { role: string; content: any }[] = [];
      if (promptForLogging) {
        logMessages.push({ role: 'human', content: promptForLogging.content });
      }
      logMessages.push({ role: 'assistant', content: response.content });
      Logger.modelInteraction(logMessages);
      
      // Ensure content passed to AgentAIMessage is stringified if it's not already a string
      const agentContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const agentResponse = new AgentAIMessage(agentContent, response.tool_calls);
      
      // Just return the state update with the agent's response.
      // The graph's routing logic (shouldContinue) will determine the next step
      // based on whether agentResponse contains tool_calls.
      if (response.tool_calls?.length > 0) {
        Logger.info(`Agent requested tool calls: ${JSON.stringify(response.tool_calls.map(tc => tc.name))}`);
      }
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
      const result = await tool.function(toolCall.args);
      
      // Log the tool result using the Logger class
      Logger.toolCall(toolCall.name, toolCall.args, result);
      
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
    const lastMessage = state.messages[state.messages.length - 1];

    // Check if the last message is a tool result. If so, loop back to the agent node for the current step.
    if (lastMessage instanceof AgentToolMessage) {
        // The agent needs to process the tool result. Route back to the current node.
        Logger.info(`Routing back to ${state.currentStep} to process tool results.`);
        // Assuming the node name matches the currentStep identifier
        return state.currentStep;
    }

    // If the last message was an AI message requesting tools, the graph should handle routing
    // to the tool execution mechanism (either implicitly via createReactAgent or explicitly via edges).
    // We don't need explicit routing *from here* for that specific case if the graph handles it.
    if ((lastMessage instanceof AIMessage || lastMessage instanceof AgentAIMessage) && lastMessage.tool_calls?.length > 0) {
        // Let the graph's edges or the ReAct agent's internal logic handle the transition to tool execution.
        // If using createReactAgent in the node itself, this might not even be hit if the agent handles the loop internally.
        // If using separate nodes, an edge from this node should handle this condition.
        // For safety, we can explicitly return the current step to ensure the agent loop continues if graph edges aren't setup for this.
        // However, returning state.currentStep here might interfere with explicit tool node routing.
        // Let's assume the graph structure handles tool calls correctly based on AIMessage with tool_calls.
        // So, we proceed to the logic below only if the last message was NOT a tool result AND NOT an AI call with tools.
    }
    
    // If the last message wasn't a tool result, and wasn't an AI message calling tools,
    // then the step is conceptually finished from the agent's perspective for this turn.
    // Now decide the *next* conceptual step based on the state.
    Logger.info(`Step ${state.currentStep} finished processing for this turn, deciding next step.`);
    switch (state.currentStep) {
      case "lookup":
        // This logic now only runs after the agent has processed any tool results for 'lookup'
        // and produced a response *without* further tool calls.
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
        return "lookup"; // Loop back for the next cycle
      default:
        // If currentStep is unexpected or signifies the end (e.g., from publish_summary)
        Logger.info(`Finishing graph execution from step: ${state.currentStep}`);
        return END; // Use END to signal the graph should stop
    }
  }
} 