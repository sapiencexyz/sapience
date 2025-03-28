import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';

export class AssessPositionsNode extends BaseNode {
  async execute(state: AgentState): Promise<AgentState> {
    Logger.step('[Assess] Evaluating current positions...');
    
    const prompt = `Assess and modify positions using the provided tools.
      You have access to these tools:
      - get_foil_position: Get information about a specific position by its ID
        Example: get_foil_position({"positionId": "123"})
      - get_foil_position_pnl: Get the PnL of a position by its ID
        Example: get_foil_position_pnl({"positionId": "123"})
      - quote_modify_foil_trader_position: Get a quote for modifying a position
        Example: quote_modify_foil_trader_position({"positionId": "123", "size": 100})
      - modify_foil_trader_position: Modify an existing position
        Example: modify_foil_trader_position({"positionId": "123", "size": 100})
      
      Current State:
      - Step: ${state.currentStep}
      - Positions: ${JSON.stringify(state.positions)}
      - Markets: ${JSON.stringify(state.markets)}
      - Actions: ${JSON.stringify(state.actions)}
      - Last Action: ${state.lastAction || 'None'}
      
      Instructions:
      1. First, use get_foil_position to check each position in the current state
      2. For each position, use get_foil_position_pnl to assess if it needs modification
      3. If a position needs modification, use quote_modify_foil_trader_position first
      4. If the quote looks good, use modify_foil_trader_position
      5. Explain your reasoning and actions clearly
      
      IMPORTANT: Use the exact tool names as shown above. Do not use variations like "getPositions" or "getPositionsById".
      
      Respond with your analysis and planned actions.`;
    
    const response = await this.invokeModel(state, prompt);
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'assess_positions',
      lastAction: 'analyze_positions',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Assess] Checking if more assessment needed...');
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("Tool calls found, continuing with tools");
      return "tools";
    }

    const content = this.formatMessageContent(lastMessage.content);
    const result = typeof content === 'string' && content.includes("Action taken") ? "assess_positions" : "discover_markets";
    Logger.info(`Assessment check result: ${result}`);
    return result;
  }
} 