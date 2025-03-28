import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class PublishSummaryNode extends BaseNode {
  public getPrompt(): string {
    return `Create a comprehensive summary of the trading session. Make it a 3-5 tweet thread in the style of Matt Levine.`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    Logger.nodeTransition(state.currentStep, 'Summary');
    Logger.step('[Summary] Generating trading session summary...');
    
    const response = await this.invokeModel(state, this.getPrompt());
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    // Handle tool calls if present
    if (response.tool_calls?.length > 0) {
      Logger.step('[Summary] 🛠️ Gathering current state information...');
      const toolResults = await this.handleToolCalls(response.tool_calls);
      
      // Get final summary with tool results
      const finalPrompt = "Based on the current state information gathered, provide a final summary of the trading session.";
      const finalResponse = await this.invokeModel({
        ...state,
        messages: [...state.messages, agentResponse, ...toolResults]
      }, finalPrompt);
      
      const finalContent = this.formatMessageContent(finalResponse.content);
      const finalMessage = new AgentAIMessage(finalContent);

      return {
        messages: [...state.messages, agentResponse, ...toolResults, finalMessage],
        currentStep: 'publish_summary',
        lastAction: 'generate_summary',
        positions: state.positions,
        markets: state.markets,
        actions: state.actions,
        toolResults: state.toolResults,
        agentAddress: state.agentAddress
      };
    }

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'publish_summary',
      lastAction: 'generate_summary',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions,
      toolResults: state.toolResults,
      agentAddress: state.agentAddress
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return "end";
  }
} 