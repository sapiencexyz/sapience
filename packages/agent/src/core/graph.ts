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
import { SystemMessage } from "@langchain/core/messages";

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
      ...convertToLangChainTools(this.tools.writeFoilContracts)
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
    stateGraph.addNode("tools", this.toolNode);
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

  private shouldUseTools(state: AgentState): NodeName {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.tool_calls?.length) {
      return "tools";
    }
    return "__end__";
  }

  public async invoke(initialState: AgentState) {
    Logger.info("Starting graph execution...");
    const result = await this.graph.invoke(initialState);
    Logger.success("Graph execution completed");
    return result;
  }
} 