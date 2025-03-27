import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { SystemMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';

export abstract class BaseNode {
  protected model: ChatOpenAI | ChatOllama;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    if (config.useOllama) {
      Logger.info(`Using Ollama model: ${config.ollamaModel || "llama2"}`);
      this.model = new ChatOllama({
        model: config.ollamaModel || "llama2",
        baseUrl: config.ollamaBaseUrl,
        temperature: 0,
      });
    } else {
      Logger.info("Using OpenAI model");
      this.model = new ChatOpenAI({
        modelName: "gpt-4",
        temperature: 0,
        openAIApiKey: config.openaiApiKey,
      });
    }
  }

  abstract execute(state: AgentState): Promise<AgentState>;
  abstract shouldContinue(state: AgentState): Promise<string>;
} 