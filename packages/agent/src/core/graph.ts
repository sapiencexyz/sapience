import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import { SettlePositionsNode } from '../nodes/settle';
import { AssessPositionsNode } from '../nodes/assess';
import { DiscoverMarketsNode } from '../nodes/discover';
import { PublishSummaryNode } from '../nodes/summary';
import { DelayNode } from '../nodes/delay';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicTool } from "@langchain/core/tools";
import { AgentToolMessage, AgentSystemMessage } from '../types/message';
import { SystemMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";

// Define the state schema for LangGraph
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  currentStep: z.string(),
  positions: z.array(z.any()),
  markets: z.array(z.any()),
  actions: z.array(z.any()),
  lastAction: z.string().optional()
});

type NodeName = "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary" | "delay" | "tools" | "__end__";

interface ToolCallMessage extends BaseMessage {
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export class GraphManager {
  private graph: any;
  private stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName>;
  private toolNode: ToolNode;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    this.toolNode = this.initializeToolNode();
    const { graph, stateGraph } = this.buildGraph();
    this.graph = graph;
    this.stateGraph = stateGraph;
  }

  private initializeToolNode(): ToolNode {
    Logger.info("Converting tools to LangChain tools...");
    const langChainTools = [
      ...convertToLangChainTools(this.tools.readFoilContracts),
      ...convertToLangChainTools(this.tools.writeFoilContracts),
      ...convertToLangChainTools(this.tools.graphql)
    ];
    Logger.info(`Tools converted: ${langChainTools.map(t => t.name).join(', ')}`);
    return new ToolNode(langChainTools);
  }

  private buildGraph(): { graph: any; stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName> } {
    Logger.info("Creating new StateGraph...");
    const stateGraph = new StateGraph<typeof agentStateSchema, any, any, NodeName>(agentStateSchema);

    // Initialize nodes
    const settleNode = new SettlePositionsNode(this.config, this.tools);
    const assessNode = new AssessPositionsNode(this.config, this.tools);
    const discoverNode = new DiscoverMarketsNode(this.config, this.tools);
    const summaryNode = new PublishSummaryNode(this.config, this.tools);
    const delayNode = new DelayNode(this.config, this.tools, this.config.interval);

    // Add nodes to the graph
    Logger.info("Adding nodes to graph...");
    stateGraph.addNode("settle_positions", settleNode.execute.bind(settleNode));
    stateGraph.addNode("assess_positions", assessNode.execute.bind(assessNode));
    stateGraph.addNode("discover_markets", discoverNode.execute.bind(discoverNode));
    stateGraph.addNode("publish_summary", summaryNode.execute.bind(summaryNode));
    stateGraph.addNode("delay", delayNode.execute.bind(delayNode));
    stateGraph.addNode("tools", this.handleToolExecution.bind(this));
    Logger.success("Nodes added successfully");

    // Add conditional edges to tools
    Logger.info("Adding conditional edges to tools...");
    stateGraph.addConditionalEdges("settle_positions", settleNode.shouldContinue.bind(settleNode));
    stateGraph.addConditionalEdges("assess_positions", assessNode.shouldContinue.bind(assessNode));
    stateGraph.addConditionalEdges("discover_markets", discoverNode.shouldContinue.bind(discoverNode));
    stateGraph.addConditionalEdges("publish_summary", summaryNode.shouldContinue.bind(summaryNode));
    stateGraph.addConditionalEdges("tools", this.shouldUseTools.bind(this));
    Logger.success("Conditional edges added");

    // Add regular edges for the main flow (ring)
    Logger.info("Adding regular edges for main flow...");
    stateGraph.addEdge("settle_positions", "assess_positions");
    stateGraph.addEdge("assess_positions", "discover_markets");
    stateGraph.addEdge("discover_markets", "publish_summary");
    stateGraph.addEdge("publish_summary", "delay");
    stateGraph.addEdge("delay", "settle_positions");
    Logger.success("Regular edges added");

    // Set the entry point
    stateGraph.setEntryPoint("settle_positions");

    return { graph: stateGraph.compile(), stateGraph };
  }

  private async handleToolExecution(state: AgentState): Promise<AgentState> {
    try {
      const lastMessage = state.messages[state.messages.length - 1] as ToolCallMessage;
      if (!lastMessage?.tool_calls?.length) {
        return state;
      }

      Logger.info(`Processing ${lastMessage.tool_calls.length} tool calls...`);

      // Execute each tool call and create tool result messages
      const toolResults = await Promise.all(
        lastMessage.tool_calls.map(async (toolCall, index) => {
          const tool = this.toolNode.tools.find(t => t.name === toolCall.name);
          if (!tool) {
            throw new Error(`Tool ${toolCall.name} not found`);
          }
          try {
            // Parse the input arguments if they're a string
            const args = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;
            const result = await tool.invoke(JSON.stringify(args));
            
            // Log the tool call with result
            Logger.toolCall(toolCall.name, args, result);
            
            // Create a tool result message in the format LangChain expects
            const toolMessage = new ToolMessage({
              content: result,
              tool_call_id: toolCall.id,
              name: toolCall.name
            });
            
            return toolMessage;
          } catch (toolError) {
            Logger.error(`Tool call ${index + 1} failed:`);
            Logger.error(`  Tool: ${toolCall.name}`);
            Logger.error(`  Arguments: ${JSON.stringify(toolCall.arguments, null, 2)}`);
            if (toolError instanceof Error) {
              Logger.error(`  Error: ${toolError.message}`);
              if (toolError.stack) {
                Logger.error(`  Stack: ${toolError.stack}`);
              }
            }
            throw toolError;
          }
        })
      );

      // Create a new state with the tool results
      const newState = {
        ...state,
        messages: [...state.messages]
      };

      // Remove the last message (which contains the tool calls)
      newState.messages.pop();

      // Add the tool call message back followed by its results
      newState.messages.push(lastMessage);
      newState.messages.push(...toolResults);

      // Log state update
      Logger.stateUpdate('tool_execution', {
        removedMessages: 1,
        addedMessages: toolResults.length + 1
      });

      return newState;
    } catch (error) {
      Logger.error("Tool execution failed:");
      if (error instanceof Error) {
        Logger.error(`Error: ${error.message}`);
        if (error.stack) {
          Logger.error(`Stack: ${error.stack}`);
        }
      }
      throw error;
    }
  }

  private shouldUseTools(state: AgentState): NodeName {
    const lastMessage = state.messages[state.messages.length - 1] as ToolCallMessage;
    if (lastMessage?.tool_calls?.length) {
      return "tools";
    }
    return "__end__";
  }

  public async invoke(initialState: AgentState) {
    Logger.info("Starting graph execution...");
    try {
      const result = await this.graph.invoke(initialState);
      Logger.success("Graph execution completed");
      return result;
    } catch (error) {
      if (error instanceof Error) {
        // Log the full error details
        Logger.error("Graph execution failed:");
        Logger.error(`Error name: ${error.name}`);
        Logger.error(`Error message: ${error.message}`);
        if ('errors' in error) {
          Logger.error("Multiple errors occurred:");
          (error as any).errors.forEach((e: any, index: number) => {
            Logger.error(`\nError ${index + 1}:`);
            Logger.error(`  Name: ${e.name}`);
            Logger.error(`  Message: ${e.message}`);
            if (e.stack) {
              Logger.error(`  Stack: ${e.stack}`);
            }
          });
        }
        if (error.stack) {
          Logger.error(`\nStack trace: ${error.stack}`);
        }
      } else {
        Logger.error(`Unknown error type: ${typeof error}`);
        Logger.error(`Error value: ${JSON.stringify(error, null, 2)}`);
      }
      throw error;
    }
  }
} 