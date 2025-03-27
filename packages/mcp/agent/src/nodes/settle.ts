import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class SettlePositionsNode extends BaseNode {
  async execute(state: AgentState): Promise<AgentState> {
    Logger.step('[Settle] Analyzing positions for settlement...');
    
    const prompt = `Analyze and settle positions using the provided tools.
      You have access to these tools:
      - get_foil_position: Get information about a specific position
      - get_foil_position_pnl: Get the PnL of a position
      - settle_foil_position: Settle a position
      
      Instructions:
      1. Use get_foil_position to check existing positions
      2. For each position, use get_foil_position_pnl to assess if it should be settled
      3. If a position should be settled, use settle_foil_position
      4. Explain your reasoning and actions clearly
      
      Respond with your analysis and planned actions.`;
    
    const response = await this.invokeModel(state, prompt);
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'settle_positions',
      lastAction: 'analyze_positions',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Settle] Checking if more settlement needed...');
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("Tool calls found, continuing with tools");
      return "tools";
    }

    const positions = state.positions?.filter(p => p.isSettleable) || [];
    const result = positions.length > 0 ? "settle_positions" : "assess_positions";
    Logger.info(`Settlement check result: ${result}`);
    return result;
  }
} 