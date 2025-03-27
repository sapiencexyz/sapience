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
        modelName: "claude-3-sonnet-20240229",
        temperature: 0.1,
        anthropicApiKey: config.anthropicApiKey,
      });
      sharedModel = claudeModel.bindTools(langChainTools);
    }
    this.model = sharedModel;
  }

  protected async invokeModel(state: AgentState, prompt: string): Promise<any> {
    // Log the full state before model invocation
    console.log(chalk.gray('\nState:'));
    console.log(chalk.gray(JSON.stringify(state, null, 2)));
    console.log(chalk.gray('\n') + chalk.gray.bold('Prompt:'));
    console.log(chalk.gray.bold(prompt));
    console.log(chalk.gray('\n'));

    // Create a system message with the current state context
    const stateContext = new SystemMessage(
      `Current State:
      - Step: ${state.currentStep}
      - Positions: ${JSON.stringify(state.positions)}
      - Markets: ${JSON.stringify(state.markets)}
      - Actions: ${JSON.stringify(state.actions)}
      - Last Action: ${state.lastAction || 'None'}
      `
    );

    const response = await this.model.invoke([
      stateContext,
      ...state.messages,
      new HumanMessage(prompt)
    ]);

    Logger.messageBlock([
      { role: 'human', content: prompt },
      { role: 'agent', content: response.content }
    ]);

    return response;
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

  abstract execute(state: AgentState): Promise<AgentState>;
  abstract shouldContinue(state: AgentState): Promise<string>;
} 