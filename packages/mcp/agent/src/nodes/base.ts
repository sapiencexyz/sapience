import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { HumanMessage, MessageContent, BaseMessageFields } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';

// Shared model instance
let sharedModel: ChatOpenAI | ChatOllama | null = null;

export abstract class BaseNode {
  protected model: ChatOpenAI | ChatOllama;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    if (!sharedModel) {
      if (config.useOllama) {
        Logger.info(`Using Ollama model: ${config.ollamaModel || "llama2"}`);
        sharedModel = new ChatOllama({
          model: config.ollamaModel || "llama2",
          baseUrl: config.ollamaBaseUrl,
          temperature: 0,
        });
      } else {
        Logger.info("Using OpenAI model");
        sharedModel = new ChatOpenAI({
          modelName: "gpt-4",
          temperature: 0,
          openAIApiKey: config.openaiApiKey,
        });
      }
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

    const response = await this.model.invoke([
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