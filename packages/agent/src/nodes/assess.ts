import { AgentState } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { AIMessage } from '@langchain/core/messages';

export class AssessPositionsNode extends BaseNode {
  public getPrompt(): string {
    return `Assess and modify positions using the provided tools.
      You have access to these tools:
      - get_foil_position: Get information about a specific position by its ID
        Example: get_foil_position({"positionId": "123"})
      - get_foil_position_pnl: Get the PnL of a position by its ID
        Example: get_foil_position_pnl({"positionId": "123"})
      - quote_modify_foil_trader_position: Get a quote for modifying a position
        Example: quote_modify_foil_trader_position({"positionId": "123", "size": 100})
      - modify_foil_trader_position: Modify an existing position
        Example: modify_foil_trader_position({"positionId": "123", "size": 100})
      
      Instructions:
      1. First, use get_foil_position to check each position in the current state
      2. For each position, use get_foil_position_pnl to assess if it needs modification
      3. If a position needs modification, use quote_modify_foil_trader_position first
      4. If the quote looks good, use modify_foil_trader_position
      5. Explain your reasoning and actions clearly
      
      IMPORTANT: Use the exact tool names as shown above. Do not use variations like "getPositions" or "getPositionsById".`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    Logger.nodeTransition(state.currentStep, 'Assess');
    Logger.step('[Assess] Evaluating current positions...');
    
    const response = await this.invokeModel(state, this.getPrompt());
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

    return {
      messages: [...state.messages, agentResponse],
      currentStep: 'assess_positions',
      lastAction: 'analyze_positions',
      positions: state.positions,
      markets: state.markets,
      actions: state.actions,
      toolResults: state.toolResults,
      agentAddress: state.agentAddress
    };
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Assess] Checking if more assessment needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
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