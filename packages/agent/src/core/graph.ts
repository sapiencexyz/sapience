import { AgentConfig, AgentTools, AgentState } from '../types/agent';
import { Logger } from '../utils/logger';
import { 
  LookupNode, 
  SettlePositionsNode, 
  AssessPositionsNode, 
  DiscoverMarketsNode, 
  PublishSummaryNode,
  DelayNode,
  BaseNode
} from '../nodes';
import { AIMessage } from "@langchain/core/messages";
import { AgentAIMessage } from '../types/message';

export class GraphManager {
  private nodes: Map<string, BaseNode>;
  private currentNode: string;

  private constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    // Initialize nodes
    this.nodes = new Map();
    this.nodes.set("lookup", new LookupNode(config, tools));
    this.nodes.set("settle_positions", new SettlePositionsNode(config, tools));
    this.nodes.set("assess_positions", new AssessPositionsNode(config, tools));
    this.nodes.set("discover_markets", new DiscoverMarketsNode(config, tools));
    this.nodes.set("publish_summary", new PublishSummaryNode(config, tools));
    this.nodes.set("delay", new DelayNode(config, tools, config.interval ?? 60000));
    
    // Set initial node
    this.currentNode = "lookup";

    Logger.success("Agent graph created successfully");
  }

  /**
   * Create a new graph manager instance
   * @param config Agent configuration
   * @param tools Agent tools
   * @returns Graph manager instance
   */
  public static createAgentGraph(config: AgentConfig, tools: AgentTools): GraphManager {
    return new GraphManager(config, tools);
  }

  /**
   * Execute the workflow starting from the specified node
   * @param startNodeId ID of the node to start from
   * @param initialState Initial state for the workflow
   * @returns Final state after execution
   */
  public async execute(startNodeId: string, initialState: AgentState): Promise<AgentState> {
    Logger.step(`[__start__ -> ${startNodeId}]`);
    
    try {
      let currentState = {
        ...initialState,
        currentStep: startNodeId
      };

      while (true) {
        // Get the current node
        const node = this.nodes.get(currentState.currentStep);
        if (!node) {
          throw new Error(`Node ${currentState.currentStep} not found`);
        }

        // Execute the node using its execute method
        currentState = await node.execute(currentState);

        // Determine next node based on current state
        const nextNode = await this.determineNextNode(currentState);
        if (nextNode === "__end__") {
          break;
        }
        currentState.currentStep = nextNode;
      }
      
      Logger.success("✅ Execution completed");
      return currentState;
    } catch (error) {
      Logger.error(`Error in graph execution: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle tool calls in the current state
   * @param state Current state
   * @returns Updated state after tool calls
   */
  private async handleToolCalls(state: AgentState): Promise<AgentState> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (!lastMessage.tool_calls?.length) {
      return state;
    }

    // Execute each tool call
    for (const toolCall of lastMessage.tool_calls) {
      const tool = this.tools.readFoilContracts[toolCall.name] || 
                  this.tools.writeFoilContracts[toolCall.name] ||
                  this.tools.graphql[toolCall.name];

      if (!tool) {
        throw new Error(`Tool ${toolCall.name} not found`);
      }

      // Execute the tool
      const result = await tool.function(toolCall.args);
      
      // Add tool result to messages
      state.messages.push(new AgentAIMessage(JSON.stringify(result), [toolCall]));

      // Update tool results in state
      state.toolResults[toolCall.name] = result;
    }

    return state;
  }

  /**
   * Determine the next node to execute based on the current state
   * @param state Current state
   * @returns ID of the next node to execute
   */
  private async determineNextNode(state: AgentState): Promise<string> {
    const node = this.nodes.get(state.currentStep);
    if (!node) {
      throw new Error(`Node ${state.currentStep} not found`);
    }

    return node.shouldContinue(state);
  }
}