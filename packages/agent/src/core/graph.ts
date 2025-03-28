import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { AgentState, AgentConfig, AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import { 
  LookupNode, 
  SettlePositionsNode, 
  AssessPositionsNode, 
  DiscoverMarketsNode, 
  PublishSummaryNode,
  DelayNode,
  ToolsNode
} from '../nodes';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { BaseMessage } from "@langchain/core/messages";
import { GraphVisualizer } from '../utils/graphVisualizer';
import { BaseNode } from '../nodes/base';
import chalk from 'chalk';

// Define the state schema for LangGraph
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  currentStep: z.string(),
  positions: z.array(z.any()),
  markets: z.array(z.any()),
  actions: z.array(z.any()),
  lastAction: z.string().optional()
});

type NodeName = "lookup" | "settle_positions" | "assess_positions" | "discover_markets" | "evaluate_market" | "publish_summary" | "delay" | "tools" | "__end__";

interface ToolCallMessage extends BaseMessage {
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export class GraphManager {
  private nodes: Map<string, BaseNode> = new Map();
  private edges: Map<string, string[]> = new Map();
  private toolsNode: BaseNode | null = null;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {}

  /**
   * Register a node with the graph
   * @param id Unique identifier for the node
   * @param node Node implementation
   * @param edges Possible next nodes
   */
  public registerNode(id: string, node: BaseNode, edges: string[] = []): void {
    this.nodes.set(id, node);
    this.edges.set(id, edges);
    Logger.debug(`Registered node: ${id} with edges to ${edges.join(', ')}`);
  }

  /**
   * Register a special tools node that handles tool execution
   * @param node Node implementation for tool execution
   */
  public registerToolsNode(node: BaseNode): void {
    this.toolsNode = node;
    Logger.debug('Registered tools node');
  }

  /**
   * Create a complete agent workflow graph with all nodes and edges
   * This is a factory method that creates the entire graph structure
   */
  public static createAgentGraph(config: AgentConfig, tools: AgentTools): GraphManager {
    const graphManager = new GraphManager(config, tools);
    
    // Define the default paths for each node
    const defaultPaths = {
      'lookup': { 
        hasPositions: 'settle_positions', 
        noPositions: 'discover_markets' 
      },
      'settle_positions': 'assess_positions',
      'assess_positions': 'discover_markets',
      'discover_markets': 'publish_summary',
      'publish_summary': 'delay',
      'delay': 'lookup'
    };
    
    // Create all nodes
    const lookupNode = new LookupNode(config, tools);
    const settleNode = new SettlePositionsNode(config, tools, defaultPaths['settle_positions']);
    const assessNode = new AssessPositionsNode(config, tools, defaultPaths['assess_positions']);
    const discoverNode = new DiscoverMarketsNode(config, tools, defaultPaths['discover_markets']);
    const summaryNode = new PublishSummaryNode(config, tools, defaultPaths['publish_summary']);
    const delayNode = new DelayNode(config, tools, config.interval || 60000, defaultPaths['delay']);
    const toolsNode = new ToolsNode(config, tools);
    
    // Register nodes with their possible edges
    graphManager.registerNode('lookup', lookupNode, ['settle_positions', 'discover_markets', 'tools']);
    graphManager.registerNode('settle_positions', settleNode, ['assess_positions', 'discover_markets', 'tools']);
    graphManager.registerNode('assess_positions', assessNode, ['discover_markets', 'tools']);
    graphManager.registerNode('discover_markets', discoverNode, ['publish_summary', 'tools']);
    graphManager.registerNode('publish_summary', summaryNode, ['delay', 'tools']);
    graphManager.registerNode('delay', delayNode, ['lookup']);
    
    // Register the tools node
    graphManager.registerToolsNode(toolsNode);
    
    Logger.success("Agent graph created successfully");
    return graphManager;
  }

  /**
   * Execute the workflow starting from the specified node
   * @param startNodeId ID of the node to start from
   * @param initialState Initial state for the workflow
   * @returns Final state after execution
   */
  public async execute(startNodeId: string, initialState: AgentState): Promise<AgentState> {
    let currentNodeId = startNodeId;
    let state = { ...initialState, currentStep: currentNodeId };
    
    Logger.info(chalk.blue(`🚀 Starting execution from node: ${currentNodeId}`));
    
    while (currentNodeId !== 'end') {
      const currentNode = this.nodes.get(currentNodeId);
      
      if (!currentNode) {
        Logger.error(`Node ${currentNodeId} not found in graph`);
        throw new Error(`Node ${currentNodeId} not found in graph`);
      }
      
      try {
        // Execute the current node
        Logger.info(chalk.blue(`▶️ Executing node: ${currentNodeId}`));
        state = await currentNode.execute(state);
        
        // Determine the next node
        const nextNodeId = await currentNode.shouldContinue(state);
        
        // Check if we need to run the tools node
        if (nextNodeId === 'tools' && this.toolsNode) {
          Logger.info(chalk.magenta('🔧 Executing tools node'));
          state = await this.toolsNode.execute(state);
          
          // After tools execution, return to the same node
          Logger.info(chalk.blue(`↩️ Returning to node: ${currentNodeId}`));
          continue;
        }
        
        // Validate that the edge exists
        const availableEdges = this.edges.get(currentNodeId) || [];
        if (!availableEdges.includes(nextNodeId) && nextNodeId !== 'end') {
          Logger.warn(`Invalid edge from ${currentNodeId} to ${nextNodeId}. Available edges: ${availableEdges.join(', ')}`);
          Logger.warn('Continuing to end node due to invalid edge');
          currentNodeId = 'end';
          continue;
        }
        
        // Log transition
        Logger.info(chalk.blue(`🔄 Transitioning from ${currentNodeId} to ${nextNodeId}`));
        
        // Update current node and state
        currentNodeId = nextNodeId;
        state = { ...state, currentStep: currentNodeId };
      } catch (error) {
        Logger.error(`Error in node ${currentNodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    }
    
    Logger.success(chalk.green('✅ Execution completed'));
    return state;
  }
}