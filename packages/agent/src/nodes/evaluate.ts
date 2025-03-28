import { AgentConfig, AgentState, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { SystemMessage } from '@langchain/core/messages';
import chalk from 'chalk';
import { AgentAIMessage } from '../types/message';

export class EvaluateMarketNode extends BaseNode {
  constructor(config: AgentConfig, tools: AgentTools) {
    super(config, tools);
  }

  getPrompt(state: AgentState): string {
    const isAssessingPosition = state.currentStep === 'assess_positions';
    const context = isAssessingPosition ? 'existing position' : 'potential new market';
    
    return `You are a market evaluator for the Foil trading agent.

Your task is to evaluate the current ${context} and determine if any actions are needed.

${isAssessingPosition ? `
For position assessment:
- Analyze the position's current state
- Check if the position needs adjusting
- Evaluate market conditions affecting the position
- Recommend actions (modify, close, or maintain position)
` : `
For market discovery:
- Analyze market conditions and liquidity
- Evaluate potential trading opportunities
- Assess risks and potential returns
- Recommend if we should open a position
`}

Available tools:
- getMarketInfo: Get detailed information about a market
- getMarketCandles: Get historical price data
- getReferencePrice: Get the current reference price
- getSqrtPriceX96: Get the current sqrt price
- getResourceCandles: Get resource price history
- getResourceTrailingAverageCandles: Get trailing average prices`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    const isAssessingPosition = state.currentStep === 'assess_positions';
    const currentItem = isAssessingPosition ? state.positions[0] : state.markets[0];
    
    Logger.step(`Evaluating ${isAssessingPosition ? 'position' : 'market'}: ${JSON.stringify(currentItem)}`);
    
    // Get model's evaluation
    const response = await this.invokeModel(state, this.getPrompt(state));
    const formattedContent = this.formatMessageContent(response.content);
    const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);
    
    // Create new state with updated arrays (remove current item)
    const newState = {
      ...state,
      messages: [...state.messages, agentResponse],
      [isAssessingPosition ? 'positions' : 'markets']: 
        state[isAssessingPosition ? 'positions' : 'markets'].slice(1),
      currentStep: isAssessingPosition ? 'assess_positions' : 'discover_markets'
    };

    // If this was the last item to evaluate, update the step
    if (newState[isAssessingPosition ? 'positions' : 'markets'].length === 0) {
      Logger.step(`Finished evaluating all ${isAssessingPosition ? 'positions' : 'markets'}`);
      newState.currentStep = isAssessingPosition ? 'discover_markets' : 'publish_summary';
    }

    return newState;
  }

  async shouldContinue(state: AgentState): Promise<string> {
    const isAssessingPosition = state.currentStep === 'assess_positions';
    const itemsToEvaluate = isAssessingPosition ? state.positions : state.markets;

    // If there are more items to evaluate, continue the loop
    if (itemsToEvaluate && itemsToEvaluate.length > 0) {
      return state.currentStep; // Return to the source node
    }

    // If no more items to evaluate, move to the next step
    return isAssessingPosition ? 'discover_markets' : 'publish_summary';
  }
} 