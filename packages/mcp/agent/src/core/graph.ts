import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { AgentState, AgentConfig, AgentTools } from '../types';
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

    // Set up entry point
    Logger.info("Setting up entry point...");
    stateGraph.setEntryPoint("settle_positions");
    Logger.success("Entry point set");

    // Compile the graph
    Logger.info("Compiling graph...");
    const graph = stateGraph.compile();
    Logger.success("Graph compiled successfully");

    return { graph, stateGraph };
  }

  private getNextStep(currentStep: string, state: AgentState): string {
    // Define the main flow between nodes
    const flow = {
      'settle_positions': 'assess_positions',
      'assess_positions': 'discover_markets',
      'discover_markets': 'publish_summary',
      'publish_summary': 'delay',
      'delay': 'settle_positions'
    };

    // If we're in the tools node, we should return to the node that called us
    if (currentStep === 'tools') {
      // Find the last non-tool message to determine where we came from
      const lastNonToolMessage = state.messages
        .slice()
        .reverse()
        .find(msg => msg.type !== 'tool');
      
      if (lastNonToolMessage) {
        // Convert message content to string if it's not already
        const content = typeof lastNonToolMessage.content === 'string' 
          ? lastNonToolMessage.content 
          : JSON.stringify(lastNonToolMessage.content);
        
        // Extract the step from the message content
        const stepMatch = content.match(/Step: (\w+)/);
        if (stepMatch) {
          return stepMatch[1];
        }
      }
      // Fallback to settle_positions if we can't determine the previous step
      return 'settle_positions';
    }

    return flow[currentStep as keyof typeof flow] || 'settle_positions';
  }

  private async shouldUseTools(state: AgentState): Promise<string> {
    Logger.step('[Tools] Checking if tools are needed...');
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (lastMessage?.tool_calls?.length > 0) {
      Logger.info("Tool calls found, routing to tools node");
      return "tools";
    }

    // If no tool calls, continue to the next step in the flow
    Logger.info("No tool calls found, continuing to next step");
    const nextStep = this.getNextStep(state.currentStep, state);
    return nextStep;
  }

  public async invoke(state: AgentState): Promise<AgentState> {
    // Add initial system message if not present
    if (!state.messages.some(m => m.type === 'system')) {
      const systemPrompt = `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
        1. Settling positions when appropriate
        2. Assessing and modifying existing positions
        3. Discovering new market opportunities
        4. Publishing trading summaries
        
        Use the available tools to interact with the Foil protocol and make trading decisions.`;
      
      state.messages = [new AgentSystemMessage(systemPrompt), ...state.messages];
    }

    const result = await this.graph.invoke(state);
    
    // Ensure we only have one set of messages
    const messages = Array.isArray(result.messages) ? result.messages : [result.messages];
    
    return {
      ...result,
      messages: messages.map(msg => {
        if (msg.type === 'tool') {
          return new AgentToolMessage(msg.content, msg.tool_call_id);
        }
        return msg;
      })
    };
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

type NodeName = "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary" | "delay" | "tools"; 