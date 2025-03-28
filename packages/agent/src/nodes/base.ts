import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, MessageContent, BaseMessageFields, SystemMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';
import { DynamicTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";
import { RunnableSequence } from "@langchain/core/runnables";
import { ToolNode } from "@langchain/langgraph/prebuilt";

// Shared model instance
let sharedModel: Runnable | null = null;

export abstract class BaseNode {
  protected model: Runnable;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
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
        streaming: false
      });
      sharedModel = claudeModel.bindTools(langChainTools);
    }
    this.model = sharedModel;
  }

  protected async invokeModel(state: AgentState, prompt: string): Promise<any> {
    try {
      // Log state changes in debug mode
      Logger.debug('Current state: ' + JSON.stringify(state, null, 2));

      // Create a system message with just the agent's role and capabilities
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
      
      IMPORTANT: Use the exact tool names as shown in the tool descriptions. Do not use variations or camelCase versions.`
      });

      // Filter out any existing system messages from state.messages
      const nonSystemMessages = state.messages.filter(msg => msg._getType() !== 'system');
      
      // Create a state message that includes the current state
      const stateMessage = new HumanMessage({
        content: `Current State:
      - Step: ${state.currentStep}
      - Positions: ${JSON.stringify(state.positions, null, 2)}
      - Markets: ${JSON.stringify(state.markets, null, 2)}
      - Actions: ${JSON.stringify(state.actions, null, 2)}
      - Last Action: ${state.lastAction || 'none'}`
      });

      // Log the model interaction
      Logger.modelInteraction(
        [
          { role: 'system', content: systemMessage.content },
          { role: 'human', content: stateMessage.content },
          ...nonSystemMessages.map(msg => ({ role: msg._getType(), content: msg.content })),
          { role: 'human', content: prompt }
        ],
        prompt
      );

      // Invoke model with the system message first, then state, then other messages
      const response = await this.model.invoke([
        systemMessage,
        stateMessage,
        ...nonSystemMessages,
        new HumanMessage(prompt)
      ]);

      // If the response contains tool calls, ensure they're properly formatted
      if ('tool_calls' in response) {
        const toolCalls = (response as any).tool_calls;
        if (Array.isArray(toolCalls)) {
          toolCalls.forEach(call => {
            // Ensure tool names are in snake_case
            if (call.name && !call.name.includes('_')) {
              call.name = call.name.replace(/([A-Z])/g, '_$1').toLowerCase();
            }
            // Ensure args are properly formatted
            if (call.args && typeof call.args === 'string') {
              try {
                call.args = JSON.parse(call.args);
              } catch (e) {
                // If parsing fails, keep the original string
              }
            }
          });
        }
      }

      return response;
    } catch (error) {
      Logger.error("Model invocation failed:");
      if (error instanceof Error) {
        Logger.error(`Error name: ${error.name}`);
        Logger.error(`Error message: ${error.message}`);
        if (error.stack) {
          Logger.error(`Stack trace: ${error.stack}`);
        }
        if ('cause' in error) {
          Logger.error(`Caused by: ${(error as any).cause}`);
        }
      } else {
        Logger.error(`Unknown error type: ${typeof error}`);
        Logger.error(`Error value: ${JSON.stringify(error, null, 2)}`);
      }
      throw error;
    }
  }

  protected formatMessageContent(content: any): string | BaseMessageFields {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map(c => 
        'text' in c ? c.text : 
        'type' in c ? `[${c.type}]` : 
        JSON.stringify(c)
      ).join('\n');
    }
    return JSON.stringify(content);
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      // Log state update at start of execution
      Logger.stateUpdate(this.constructor.name, {
        step: state.currentStep,
        lastAction: state.lastAction
      });

      const result = await this.invokeModel(state, this.getPrompt());
      
      // Log state update after execution
      Logger.stateUpdate(this.constructor.name, {
        step: result.currentStep,
        lastAction: result.lastAction,
        messageCount: result.messages.length
      });

      return result;
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

  abstract shouldContinue(state: AgentState): Promise<string>;
  abstract getPrompt(): string;
} 