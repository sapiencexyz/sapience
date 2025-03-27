import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class PublishSummaryNode extends BaseNode {
  async execute(state: AgentState): Promise<AgentState> {
    Logger.step('[Summary] Generating trading session summary...');
    
    const prompt = `Create a comprehensive summary of the trading session.
      Use these tools to gather information:
      - get_foil_position: Get information about positions
      - get_foil_position_pnl: Get PnL information
      - get_foil_market_info: Get market information
      
      Instructions:
      1. Use the tools to gather current state information
      2. Summarize all actions taken in the session
      3. Provide current portfolio state and risk metrics
      4. Give recommendations for next steps
      5. Format your response clearly with sections
      
      Provide a detailed summary of the trading session.`;
    
    const response = await this.invokeModel(state, prompt);
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    // Generate tweet-thread style summary
    const tweetPrompt = "Great! Now summarize everything that happened in this chat in a succinct and fun way that could fit in a five tweet thread.";
    const tweetResponse = await this.invokeModel(state, tweetPrompt);
    Logger.info(`[Summary] Tweet Thread Summary: ${tweetResponse.content}`);

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'publish_summary',
      lastAction: 'generate_summary',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    return "end";
  }
} 