import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class DelayNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools,
    private delayMs: number
  ) {
    super(config, tools);
  }

  async execute(state: AgentState): Promise<AgentState> {
    Logger.step(`[Delay] Waiting ${this.delayMs}ms before next iteration...`);
    
    // Add a message about the delay
    const delayMessage = new AgentAIMessage(`Waiting ${this.delayMs}ms before starting next iteration...`);
    
    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    
    return {
      ...state,
      messages: [...state.messages, delayMessage],
      currentStep: 'delay',
      lastAction: 'delay'
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    // Always continue to settle positions after delay
    return "settle_positions";
  }
} 