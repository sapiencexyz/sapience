import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class DelayNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    private delayMs: number,
    nextNode?: string
  ) {
    super(config, tools, nextNode || "lookup");
  }

  async execute(state: AgentState): Promise<AgentState> {
    Logger.step(`Waiting ${this.delayMs}ms before next iteration...`);
    
    // Add a message about the delay
    const delayMessage = new AgentAIMessage(`Waiting ${this.delayMs}ms before starting next iteration...`);
    
    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    
    Logger.step(`Delay complete, returning to lookup node`);
    
    return this.createStateUpdate(state, [delayMessage]);
  }

  public getPrompt(state: AgentState): string {
    return `Waiting ${this.delayMs}ms before starting next iteration...`;
  }

  async shouldContinue(state: AgentState): Promise<string> {
    // Always use the default next node (lookup)
    return super.shouldContinue(state);
  }
} 