import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import chalk from 'chalk';

export class UpdateNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  protected getPrompt(state: AgentState): AIMessage {
    return new AIMessage(`You are a Foil trading agent responsible for updating positions based on market conditions.
    
    You have access to the following tools:
    - readFoilContracts: Read data from Foil contracts
    - writeFoilContracts: Write data to Foil contracts
    - graphql: Query market data
    
    Your task is to:
    1. Review the evaluation results
    2. Determine necessary position updates
    3. Execute position changes if needed
    
    IMPORTANT: Make careful decisions about position updates based on the evaluation results.
    
    ${this.formatToolResultsForPrompt(state)}`);
  }

  protected async processToolResults(
    state: AgentState, 
    agentResponse: AIMessage,
    toolResults: ToolMessage[]
  ): Promise<AgentState | null> {
    Logger.step('[Update] Processing tool results...');
    
    const analysisPrompt = `Based on the position updates, what is the current state and what actions were taken?`;
    
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
    Logger.step('[Update] Processing response...');
    
    const formattedContent = this.formatMessageContent(response.content);
    const formattedMessage = new AgentAIMessage(formattedContent);
    
    return this.createStateUpdate(state, [formattedMessage]);
  }
} 