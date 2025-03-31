import { SystemMessage, HumanMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

export class DelayNode extends BaseNode {
  private delayMs: number;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    delayMs: number
  ) {
    super(config, tools);
    this.delayMs = delayMs;
  }

  protected getPrompt(state: AgentState): BaseMessage {
    return new HumanMessage(`You are a Foil trading agent responsible for managing delays.
      
      Your task is to:
      1. Wait for the specified delay period (${this.delayMs}ms)
      2. Return control to the next node in the workflow
      
      IMPORTANT: This is a utility node for managing timing in the workflow.`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step(`[Delay] Waiting for ${this.delayMs / 1000} seconds...`);
      
      // Wait for the specified duration
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
      
      Logger.success(`[Delay] Completed ${this.delayMs / 1000} second delay`);
      
      // Create a response message
      const response = new AgentAIMessage(`Completed ${this.delayMs / 1000} second delay`);
      
      // Update state with the delay completion message
      return this.createStateUpdate(state, [response]);
    } catch (error) {
      Logger.error(`Error in DelayNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async shouldContinue(state: AgentState): Promise<string> {
    // Always use the default next node (lookup)
    return super.shouldContinue(state);
  }
} 