import { AgentConfig, AgentState, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { SystemMessage } from '@langchain/core/messages';

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
- getResourceTrailingAverageCandles: Get trailing average prices

When using tools, format your response as:
Thought: I need to [describe what you're going to do]
Action: [tool name]
Action Input: [tool parameters as JSON]
Observation: [tool result]
... (repeat if needed)
Thought: I now know [what you learned]
Final Answer: [summary and recommendation]`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    const isAssessingPosition = state.currentStep === 'assess_positions';
    const currentItem = isAssessingPosition ? state.positions[0] : state.markets[0];
    
    Logger.info(`Evaluating ${isAssessingPosition ? 'position' : 'market'}: ${JSON.stringify(currentItem)}`);

    // Create new state with updated arrays (remove current item)
    const newState = {
      ...state,
      [isAssessingPosition ? 'positions' : 'markets']: 
        state[isAssessingPosition ? 'positions' : 'markets'].slice(1),
      currentStep: 'evaluate_market'
    };

    // If this was the last item to evaluate, update the step
    if (newState[isAssessingPosition ? 'positions' : 'markets'].length === 0) {
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