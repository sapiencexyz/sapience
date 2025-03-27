import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
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

type NodeName = typeof START | typeof END | "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary" | "tools";

export class FoilAgent {
  private graph: RunnableSequence;
  private stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName>;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private model: ChatOpenAI | ChatOllama;
  private toolNode: ToolNode;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    console.log("Initializing FoilAgent with config:", config);
    if (config.useOllama) {
      console.log("Using Ollama model:", config.ollamaModel);
      this.model = new ChatOllama({
        model: config.ollamaModel || "mistral",
        baseUrl: config.ollamaBaseUrl,
        temperature: 0,
      });
    } else {
      console.log("Using OpenAI model");
      this.model = new ChatOpenAI({
        modelName: "gpt-4",
        temperature: 0,
        openAIApiKey: config.openaiApiKey,
      });
    }

    console.log("Converting tools to LangChain tools...");
    // Convert tools to LangChain tools
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
    console.log("Tools converted:", langChainTools.map(t => t.name));

    // Initialize tool node
    console.log("Initializing tool node...");
    this.toolNode = new ToolNode(langChainTools);

    console.log("Building graph...");
    const { graph, stateGraph } = this.buildGraph();
    this.graph = graph;
    this.stateGraph = stateGraph;
    console.log("Graph built successfully");
  }

  private buildGraph(): { graph: any; stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName> } {
    console.log("Creating new StateGraph...");
    const stateGraph = new StateGraph<typeof agentStateSchema, any, any, NodeName>(agentStateSchema);

    // Define the nodes
    console.log("Defining nodes...");
    const settlePositions = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Executing settlePositions node...");
      // First, let the LLM analyze the positions and decide what to do
      const response = await this.model.invoke([
        ...state.messages,
        new HumanMessage(`You are a Foil trading agent. Analyze the current state and determine if any positions need to be settled.
        Consider market conditions, position size, and any other relevant factors. 
        If you find positions that should be settled, use the appropriate tools to do so.`)
      ]);
      console.log("SettlePositions node completed");

      // Add the LLM's response to messages
      return { 
        messages: [...state.messages, response]
      };
    };

    const assessPositions = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Executing assessPositions node...");
      // Let the LLM analyze current positions and market conditions
      const response = await this.model.invoke([
        ...state.messages,
        new HumanMessage(`You are a Foil trading agent. Analyze current positions and market conditions to determine if any positions need to be modified.
        Consider:
        1. Market volatility
        2. Position exposure
        3. Risk management parameters
        4. Market trends
        If you find positions that need modification, use the appropriate tools to do so.`)
      ]);
      console.log("AssessPositions node completed");

      return { 
        messages: [...state.messages, response]
      };
    };

    const discoverMarkets = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Executing discoverMarkets node...");
      // Let the LLM analyze market opportunities
      const response = await this.model.invoke([
        ...state.messages,
        new HumanMessage(`You are a Foil trading agent. Analyze available markets and identify potential opportunities.
        Consider:
        1. Market liquidity
        2. Risk/reward ratios
        3. Market trends
        4. Correlation with existing positions
        If you find promising markets, use the appropriate tools to get more information or take action.`)
      ]);
      console.log("DiscoverMarkets node completed");

      return { 
        messages: [...state.messages, response]
      };
    };

    const publishSummary = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Executing publishSummary node...");
      // Let the LLM create a comprehensive summary
      const response = await this.model.invoke([
        ...state.messages,
        new HumanMessage(`You are a Foil trading agent. Create a comprehensive summary of all actions taken and current state.
        Include:
        1. Positions settled
        2. Positions modified
        3. New markets discovered
        4. Current portfolio state
        5. Risk metrics
        6. Next steps or recommendations`)
      ]);
      console.log("PublishSummary node completed");

      return { 
        messages: [...state.messages, response]
      };
    };

    // Add nodes to the graph
    console.log("Adding nodes to graph...");
    stateGraph.addNode("settle_positions", settlePositions);
    stateGraph.addNode("assess_positions", assessPositions);
    stateGraph.addNode("discover_markets", discoverMarkets);
    stateGraph.addNode("publish_summary", publishSummary);
    stateGraph.addNode("tools", this.toolNode);
    console.log("Nodes added successfully");

    // Define conditional edges
    console.log("Defining conditional edges...");
    const shouldContinueSettling = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Checking shouldContinueSettling...");
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for settling positions
      if (lastMessage.tool_calls?.length > 0) {
        console.log("Should continue settling: yes (tool calls found)");
        return "tools";
      }

      // Check if there are still settleable positions
      const positions = this.parsePositionsFromMessages(state.messages);
      const settleablePositions = positions.filter(p => p.isSettleable);
      
      const result = settleablePositions.length > 0 ? "settle_positions" : "assess_positions";
      console.log("Should continue settling:", result);
      return result;
    };

    const shouldContinueAssessing = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Checking shouldContinueAssessing...");
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for assessing positions
      if (lastMessage.tool_calls?.length > 0) {
        console.log("Should continue assessing: yes (tool calls found)");
        return "tools";
      }

      // Check if we need more assessment
      const result = lastMessage.content.includes("Action taken") ? "assess_positions" : "discover_markets";
      console.log("Should continue assessing:", result);
      return result;
    };

    const shouldContinueDiscovering = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Checking shouldContinueDiscovering...");
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for discovering markets
      if (lastMessage.tool_calls?.length > 0) {
        console.log("Should continue discovering: yes (tool calls found)");
        return "tools";
      }

      // Check if we need more discovery
      const discoveryMessages = state.messages.filter(m => 
        m.content.includes("Discovering new markets")
      );
      const result = discoveryMessages.length < 5 ? "discover_markets" : "publish_summary";
      console.log("Should continue discovering:", result);
      return result;
    };

    const shouldUseTools = async (state: z.infer<typeof agentStateSchema>) => {
      console.log("Checking shouldUseTools...");
      const lastMessage = state.messages[state.messages.length - 1];
      
      // If there are tool calls, continue using tools
      if (lastMessage.tool_calls?.length > 0) {
        console.log("Should use tools: yes (tool calls found)");
        return "tools";
      }

      // Otherwise, return to the previous node
      const previousNode = state.messages[state.messages.length - 2]?.content;
      let result;
      if (previousNode?.includes("settle_positions")) result = "settle_positions";
      else if (previousNode?.includes("assess_positions")) result = "assess_positions";
      else if (previousNode?.includes("discover_markets")) result = "discover_markets";
      else result = "publish_summary";
      
      console.log("Should use tools:", result);
      return result;
    };

    // Add edges with conditional routing
    console.log("Adding conditional edges...");
    stateGraph.addConditionalEdges("settle_positions", shouldContinueSettling);
    stateGraph.addConditionalEdges("assess_positions", shouldContinueAssessing);
    stateGraph.addConditionalEdges("discover_markets", shouldContinueDiscovering);
    stateGraph.addConditionalEdges("tools", shouldUseTools);
    console.log("Conditional edges added");

    // Add regular edges between nodes
    console.log("Adding regular edges...");
    stateGraph.addEdge("settle_positions", "assess_positions");
    stateGraph.addEdge("assess_positions", "discover_markets");
    stateGraph.addEdge("discover_markets", "publish_summary");
    stateGraph.addEdge("tools", "settle_positions");
    stateGraph.addEdge("tools", "assess_positions");
    stateGraph.addEdge("tools", "discover_markets");
    console.log("Regular edges added");

    // Set up entry and final nodes
    console.log("Setting up entry and final nodes...");
    stateGraph.setEntryPoint("settle_positions");
    stateGraph.setFinishPoint("publish_summary");

    // Compile the graph
    console.log("Compiling graph...");
    const graph = stateGraph.compile();
    console.log("Graph compiled successfully");

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
    console.log("Creating initial state...");
    return {
      messages: [
        new HumanMessage("You are a Foil trading agent. Analyze the current state and take appropriate actions.")
      ]
    };
  }

  private async runIteration() {
    try {
      console.log("Starting new iteration...");
      console.log("Initializing state...");
      const state = await this.initializeState();
      console.log("State initialized:", state);
      
      console.log("Executing graph...");
      // Execute the graph
      const finalState = await this.graph.invoke(state);
      console.log("Graph execution completed");
      
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