import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { SettlePositionsNode } from '../nodes/settle';
import { AssessPositionsNode } from '../nodes/assess';
import { DiscoverMarketsNode } from '../nodes/discover';
import { PublishSummaryNode } from '../nodes/summary';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicTool } from "@langchain/core/tools";

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
      ...Object.values(this.tools.readFoilContracts).map(tool => 
        new DynamicTool({
          name: tool.name,
          description: tool.description,
          func: async (input: string) => {
            try {
              const args = JSON.parse(input);
              const result = await tool.function(args);
              return JSON.stringify(result);
            } catch (error) {
              return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
            }
          },
        })
      ),
      ...Object.values(this.tools.writeFoilContracts).map(tool => 
        new DynamicTool({
          name: tool.name,
          description: tool.description,
          func: async (input: string) => {
            try {
              const args = JSON.parse(input);
              const result = await tool.function(args);
              return JSON.stringify(result);
            } catch (error) {
              return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
            }
          },
        })
      )
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

    // Add nodes to the graph
    Logger.info("Adding nodes to graph...");
    stateGraph.addNode("settle_positions", settleNode.execute.bind(settleNode));
    stateGraph.addNode("assess_positions", assessNode.execute.bind(assessNode));
    stateGraph.addNode("discover_markets", discoverNode.execute.bind(discoverNode));
    stateGraph.addNode("publish_summary", summaryNode.execute.bind(summaryNode));
    stateGraph.addNode("tools", this.toolNode);
    Logger.success("Nodes added successfully");

    // Add conditional edges
    Logger.info("Adding conditional edges...");
    stateGraph.addConditionalEdges("settle_positions", settleNode.shouldContinue.bind(settleNode));
    stateGraph.addConditionalEdges("assess_positions", assessNode.shouldContinue.bind(assessNode));
    stateGraph.addConditionalEdges("discover_markets", discoverNode.shouldContinue.bind(discoverNode));
    stateGraph.addConditionalEdges("tools", this.shouldUseTools.bind(this));
    Logger.success("Conditional edges added");

    // Add regular edges
    Logger.info("Adding regular edges...");
    stateGraph.addEdge("settle_positions", "assess_positions");
    stateGraph.addEdge("assess_positions", "discover_markets");
    stateGraph.addEdge("discover_markets", "publish_summary");
    stateGraph.addEdge("tools", "settle_positions");
    stateGraph.addEdge("tools", "assess_positions");
    stateGraph.addEdge("tools", "discover_markets");
    Logger.success("Regular edges added");

    // Set up entry and final nodes
    Logger.info("Setting up entry and final nodes...");
    stateGraph.setEntryPoint("settle_positions");
    stateGraph.setFinishPoint("publish_summary");

    // Compile the graph
    Logger.info("Compiling graph...");
    const graph = stateGraph.compile();
    Logger.success("Graph compiled successfully");

    return { graph, stateGraph };
  }

  private async shouldUseTools(state: AgentState): Promise<string> {
    Logger.step('[Tools] Checking if tools are needed...');
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (lastMessage.tool_calls?.length > 0) {
      Logger.info("Tool calls found, continuing with tools");
      return "tools";
    }

    const previousNode = state.messages[state.messages.length - 2]?.content;
    let result;
    if (previousNode?.includes("settle_positions")) result = "settle_positions";
    else if (previousNode?.includes("assess_positions")) result = "assess_positions";
    else if (previousNode?.includes("discover_markets")) result = "discover_markets";
    else result = "publish_summary";
    
    Logger.info(`Tools check result: ${result}`);
    return result;
  }

  public async invoke(state: AgentState): Promise<AgentState> {
    return this.graph.invoke(state);
  }
}

// Define the state schema
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  currentStep: z.string(),
  lastAction: z.string().optional(),
  positions: z.array(z.any()).optional(),
  markets: z.array(z.any()).optional(),
  actions: z.array(z.any()).optional()
});

type NodeName = "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary" | "tools"; 