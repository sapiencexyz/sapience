import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

export class EvaluateNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): AIMessage {
    return new AIMessage(`You are a Foil trading agent responsible for evaluating market conditions and positions.

You have access to the following tools:
- readFoilContracts: Read data from Foil contracts
- writeFoilContracts: Write data to Foil contracts
- graphql: Query market data

Your task is to:
1. Analyze current market conditions
2. Evaluate existing positions
3. Identify potential opportunities or risks

IMPORTANT: Use the provided tools to gather data and make informed decisions.

${this.formatToolResultsForPrompt(state)}`);
  }

  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    Logger.step('[Evaluate] Processing tool results...');
    
    const analysisPrompt = `Based on the market data and position information, what are your findings and recommendations?`;
    
    const analysisResponse = await this.invokeModel([
      ...state.messages,
      agentResponse,
      ...toolResults,
      new AIMessage(analysisPrompt)
    ]);
    
    const analysisContent = this.formatMessageContent(analysisResponse.content);
    const analysisMessage = new AgentAIMessage(analysisContent);

    return this.createStateUpdate(state, [agentResponse, ...toolResults, analysisMessage]);
  }

  protected async processResponse(
    state: AgentState, 
    response: AIMessage
  ): Promise<AgentState | null> {
    Logger.step('[Evaluate] Processing response...');
    
    const formattedContent = this.formatMessageContent(response.content);
    const formattedMessage = new AgentAIMessage(formattedContent);
    
    return this.createStateUpdate(state, [formattedMessage]);
  }
} 