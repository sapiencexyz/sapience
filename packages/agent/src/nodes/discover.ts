import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import { AgentAIMessage } from '../types/message';
import { ToolNode } from "@langchain/langgraph/prebuilt";

export class DiscoverMarketsNode extends BaseNode {
  private toolNode: ToolNode;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
    // Convert our tools to LangChain tools for the ToolNode
    const langChainTools = [
      ...convertToLangChainTools(tools.readFoilContracts),
      ...convertToLangChainTools(tools.writeFoilContracts),
      ...convertToLangChainTools(tools.graphql)
    ];
    this.toolNode = new ToolNode(langChainTools);
  }

  public getPrompt(): string {
    return `Discover and analyze market opportunities using the provided tools.
      You have access to these tools:
      - getMarketInfo: Get information about a specific market
      - getLatestEpochInfo: Get the latest period information
      - quoteCreateTraderPosition: Get a quote for creating a new position
      - createTraderPosition: Create a new position
      
      Instructions:
      1. Use getMarketInfo to analyze available markets
      2. For promising markets, use getLatestEpochInfo to check current conditions
      3. If a market looks good, use quoteCreateTraderPosition first
      4. If the quote looks good, use createTraderPosition
      5. Explain your reasoning and actions clearly
      
      Respond with your analysis and planned actions.`;
  }

  async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Discover] Searching for market opportunities...');
      
      const response = await this.invokeModel(state, this.getPrompt());
      const formattedContent = this.formatMessageContent(response.content);
      const agentResponse = new AgentAIMessage(formattedContent, response.tool_calls);

      // Handle tool calls if present
      if (response.tool_calls?.length > 0) {
        const toolResults = await this.handleToolCalls(response.tool_calls);
        return {
          messages: [...state.messages, agentResponse, ...toolResults],
          currentStep: 'discover_markets',
          lastAction: 'analyze_markets',
          positions: state.positions,
          markets: state.markets,
          actions: state.actions,
          toolResults: {
            ...state.toolResults,
            ...toolResults.reduce((acc, msg) => ({
              ...acc,
              [msg.name]: msg.content
            }), {})
          }
        };
      }

      return {
        messages: [...state.messages, agentResponse],
        currentStep: 'discover_markets',
        lastAction: 'analyze_markets',
        positions: state.positions,
        markets: state.markets,
        actions: state.actions,
        toolResults: state.toolResults
      };
    } catch (error) {
      Logger.error(`Error in DiscoverMarketsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async handleToolCalls(toolCalls: any[]): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        // Find the tool in any of the tool categories
        const tool = Object.values(this.tools.readFoilContracts).find(t => t.name === toolCall.name) ||
                    Object.values(this.tools.writeFoilContracts).find(t => t.name === toolCall.name) ||
                    Object.values(this.tools.graphql).find(t => t.name === toolCall.name);

        if (tool) {
          const result = await tool.function(toolCall.args);
          results.push(new ToolMessage(JSON.stringify(result), toolCall.id));
        }
      } catch (error) {
        Logger.error(`Error executing tool ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.push(new ToolMessage(
          JSON.stringify({ error: 'Tool execution failed' }),
          toolCall.id
        ));
      }
    }
    
    return results;
  }

  async shouldContinue(state: AgentState): Promise<string> {
    Logger.step('[Discover] Checking if more discovery needed...');
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("Tool calls found, continuing with tools");
      return "tools";
    }

    // Check if we've made any market discoveries in this iteration
    const hasDiscoveredMarkets = state.markets?.length > 0;
    const result = hasDiscoveredMarkets ? "publish_summary" : "discover_markets";
    Logger.info(`Discovery check result: ${result}`);
    return result;
  }
} 