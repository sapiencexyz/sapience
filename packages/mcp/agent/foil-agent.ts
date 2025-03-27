import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AgentState, AgentConfig, AgentTools, Action, Position, Market } from "./types";
import { RunnableSequence } from "@langchain/core/runnables";
import { DynamicTool } from "@langchain/core/tools";
import { writeFileSync } from "node:fs";
import { z } from "zod";

// Define the state schema
const agentStateSchema = z.object({
  messages: z.array(z.any())
});

type NodeName = typeof START | typeof END | "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary";

export class FoilAgent {
  private graph: RunnableSequence;
  private stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName>;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private model: ChatOpenAI;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    this.model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
      openAIApiKey: config.openaiApiKey,
    });

    const { graph, stateGraph } = this.buildGraph();
    this.graph = graph;
    this.stateGraph = stateGraph;
  }

  private convertToLangChainTool(tool: any): DynamicTool {
    return new DynamicTool({
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
    });
  }

  private buildGraph(): { graph: any; stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName> } {
    const stateGraph = new StateGraph<typeof agentStateSchema, any, any, NodeName>(agentStateSchema);

    // Define the nodes
    const settlePositions = async (state: z.infer<typeof agentStateSchema>) => {
      // Parse positions from messages
      const positions = this.parsePositionsFromMessages(state.messages);
      const settleActions = await this.checkSettleablePositions(positions);
      
      // Add the actions to the messages
      const actionMessages = settleActions.map(action => 
        new AIMessage(`Action taken: ${JSON.stringify(action)}`)
      );
      
      return { 
        messages: [...state.messages, ...actionMessages]
      };
    };

    const assessPositions = async (state: z.infer<typeof agentStateSchema>) => {
      // Parse positions and markets from messages
      const positions = this.parsePositionsFromMessages(state.messages);
      const markets = this.parseMarketsFromMessages(state.messages);
      const marketActions = await this.analyzeMarkets(positions, markets);
      
      // Add the actions to the messages
      const actionMessages = marketActions.map(action => 
        new AIMessage(`Action taken: ${JSON.stringify(action)}`)
      );
      
      return { 
        messages: [...state.messages, ...actionMessages]
      };
    };

    const discoverMarkets = async (state: z.infer<typeof agentStateSchema>) => {
      // This would be a new method to discover new markets
      // For now, we'll just add a message
      return { 
        messages: [...state.messages, new AIMessage("Discovering new markets...")]
      };
    };

    const publishSummary = async (state: z.infer<typeof agentStateSchema>) => {
      // This would be a new method to publish a summary of actions taken
      // For now, we'll just add a message
      return { 
        messages: [...state.messages, new AIMessage("Publishing summary...")]
      };
    };

    // Add nodes to the graph
    stateGraph.addNode("settle_positions", settlePositions);
    stateGraph.addNode("assess_positions", assessPositions);
    stateGraph.addNode("discover_markets", discoverMarkets);
    stateGraph.addNode("publish_summary", publishSummary);

    // Define conditional edges
    const shouldContinueSettling = async (state: z.infer<typeof agentStateSchema>) => {
      // Parse positions from messages to check if there are more to settle
      const positions = this.parsePositionsFromMessages(state.messages);
      const settleablePositions = positions.filter(p => p.isSettleable);
      
      // If there are still settleable positions, continue settling
      // Otherwise move to assess positions
      return settleablePositions.length > 0 ? "settle_positions" : "assess_positions";
    };

    const shouldContinueAssessing = async (state: z.infer<typeof agentStateSchema>) => {
      const lastMessage = state.messages[state.messages.length - 1];
      return lastMessage.content.includes("Action taken") ? "assess_positions" : "discover_markets";
    };

    const shouldContinueDiscovering = async (state: z.infer<typeof agentStateSchema>) => {
      const discoveryMessages = state.messages.filter(m => 
        m.content.includes("Discovering new markets")
      );
      return discoveryMessages.length < 5 ? "discover_markets" : "publish_summary";
    };

    // Add edges with conditional routing
    stateGraph.addConditionalEdges("settle_positions", shouldContinueSettling);
    stateGraph.addConditionalEdges("assess_positions", shouldContinueAssessing);
    stateGraph.addConditionalEdges("discover_markets", shouldContinueDiscovering);

    // Set up entry and final nodes
    stateGraph.setEntryPoint("settle_positions");
    stateGraph.setFinishPoint("publish_summary");

    // Compile the graph
    const graph = stateGraph.compile();

    return { graph, stateGraph };
  }

  private parsePositionsFromMessages(messages: any[]): Position[] {
    // Parse positions from messages that contain position information
    return messages
      .filter(m => m.content.includes("Position:"))
      .map(m => {
        try {
          const positionData = JSON.parse(m.content.split("Position:")[1]);
          return positionData as Position;
        } catch {
          return null;
        }
      })
      .filter((p): p is Position => p !== null);
  }

  private parseMarketsFromMessages(messages: any[]): Market[] {
    // Parse markets from messages that contain market information
    return messages
      .filter(m => m.content.includes("Market:"))
      .map(m => {
        try {
          const marketData = JSON.parse(m.content.split("Market:")[1]);
          return marketData as Market;
        } catch {
          return null;
        }
      })
      .filter((m): m is Market => m !== null);
  }

  private async checkSettleablePositions(positions: Position[]): Promise<Action[]> {
    const settleActions = await Promise.all(
      positions
        .filter(position => position.isSettleable)
        .map(async position => {
          const quoteResult = await this.tools.writeFoilContracts.quoteModifyTraderPosition.function({
            marketAddress: position.market,
            positionId: position.id,
            newSize: "0",
            newCollateralAmount: "0",
          });

          if (quoteResult.isError) return null;
          
          const settleAction: Action = {
            type: 'SETTLE',
            positionId: position.id,
          };
          
          return settleAction;
        })
    );
    
    return settleActions.filter((action): action is Action => action !== null);
  }

  private async analyzeMarkets(positions: Position[], markets: Market[]): Promise<Action[]> {
    const actions: Action[] = [];
    
    for (const market of markets) {
      if (!market.isActive) continue;

      const marketPositions = positions.filter(p => p.market === market.address);
      
      if (marketPositions.length === 0) {
        const quoteResult = await this.tools.writeFoilContracts.quoteCreateTraderPosition.function({
          marketAddress: market.address,
          epochId: market.currentEpoch,
          size: this.calculatePositionSize(),
          collateralAmount: this.calculateCollateral(),
        });

        if (!quoteResult.isError) {
          actions.push({
            type: 'CREATE_POSITION',
            marketAddress: market.address,
            size: this.calculatePositionSize(),
            collateral: this.calculateCollateral(),
          });
        }
      } else {
        for (const position of marketPositions) {
          if (await this.shouldModifyPosition(position)) {
            const quoteResult = await this.tools.writeFoilContracts.quoteModifyTraderPosition.function({
              marketAddress: position.market,
              positionId: position.id,
              newSize: this.calculatePositionSize(),
              newCollateralAmount: this.calculateCollateral(),
            });

            if (!quoteResult.isError) {
              actions.push({
                type: 'MODIFY_POSITION',
                positionId: position.id,
                size: this.calculatePositionSize(),
                collateral: this.calculateCollateral(),
              });
            }
          }
        }
      }
    }
    return actions;
  }

  private calculatePositionSize(): string {
    return "1000000000000000000"; // 1 ETH in wei
  }

  private calculateCollateral(): string {
    return "100000000000000000"; // 0.1 ETH in wei
  }

  private async shouldModifyPosition(position: Position): Promise<boolean> {
    const marketInfo = await this.tools.readFoilContracts.getMarketInfo.function({
      marketAddress: position.market,
    });

    if (marketInfo.isError) return false;

    const epochInfo = await this.tools.readFoilContracts.getEpochInfo.function({
      marketAddress: position.market,
      epochId: marketInfo.content[0].text,
    });

    return !epochInfo.isError;
  }

  private async initializeState(): Promise<z.infer<typeof agentStateSchema>> {
    // Add some test positions and markets to the initial state
    const testPositions = [
      {
        id: "1",
        market: "0x123",
        isSettleable: true
      },
      {
        id: "2",
        market: "0x456",
        isSettleable: false
      }
    ];

    const testMarkets = [
      {
        address: "0x123",
        isActive: true,
        currentEpoch: "1"
      },
      {
        address: "0x456",
        isActive: true,
        currentEpoch: "1"
      }
    ];

    return {
      messages: [
        new HumanMessage("Initialize Foil trading agent"),
        new AIMessage(`Position: ${JSON.stringify(testPositions[0])}`),
        new AIMessage(`Position: ${JSON.stringify(testPositions[1])}`),
        new AIMessage(`Market: ${JSON.stringify(testMarkets[0])}`),
        new AIMessage(`Market: ${JSON.stringify(testMarkets[1])}`)
      ]
    };
  }

  private async runIteration() {
    try {
      console.log("Starting new iteration...");
      const state = await this.initializeState();
      
      // Execute the graph
      const finalState = await this.graph.invoke(state);
      
      // Log the messages
      console.log("Messages from this iteration:", finalState.messages);
    } catch (error) {
      console.error("Error in agent iteration:", error);
    }
  }

  public async start() {
    if (this.isRunning) {
      console.log("Agent is already running");
      return;
    }

    this.isRunning = true;
    console.log("Starting Foil trading agent...");

    // Run immediately on start
    await this.runIteration();

    // Only set up interval if it's greater than 0
    if (this.config.interval > 0) {
      console.log(`Setting up interval of ${this.config.interval}ms`);
      this.interval = setInterval(async () => {
        await this.runIteration();
      }, this.config.interval);
    } else {
      console.log("Running in one-time mode");
      this.stop();
    }
  }

  public stop() {
    if (!this.isRunning) {
      console.log("Agent is not running");
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    console.log("Stopped Foil trading agent");
  }

  public async saveGraphVisualization(filePath: string = "./graph.md"): Promise<void> {
    try {
      // For now, we'll just save a Mermaid diagram representation
      const mermaidDiagram = `graph TD
        Start[Start] --> Settle[Settle Positions]
        Settle --> Assess[Assess Positions]
        Assess --> Discover[Discover Markets]
        Discover --> Publish[Publish Summary]
        
        style Start fill:#f9f,stroke:#333,stroke-width:2px
        style Publish fill:#f9f,stroke:#333,stroke-width:2px
        style Settle fill:#bbf,stroke:#333,stroke-width:2px
        style Assess fill:#bfb,stroke:#333,stroke-width:2px
        style Discover fill:#fbb,stroke:#333,stroke-width:2px`;

      writeFileSync(filePath, mermaidDiagram);
      console.log(`Graph visualization saved to ${filePath}`);
      console.log("Note: You can visualize this graph by copying the contents to a Mermaid editor (e.g., https://mermaid.live)");
    } catch (error) {
      console.error("Error saving graph visualization:", error);
      throw error;
    }
  }
} 