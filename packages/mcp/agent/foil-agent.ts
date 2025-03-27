import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AgentState, AgentConfig, AgentTools, Action, Position, Market } from "./types";
import { RunnableSequence } from "@langchain/core/runnables";
import { DynamicTool } from "@langchain/core/tools";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import chalk from 'chalk';
import fetch from 'node-fetch';

// Logger utility
const log = {
  info: (msg: string | string[]) => {
    const msgStr = Array.isArray(msg) ? msg.join('\n') : msg;
    console.log(chalk.blue('ℹ'), chalk.blue(msgStr));
  },
  success: (msg: string) => console.log(chalk.green('✓'), chalk.green(msg)),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), chalk.yellow(msg)),
  error: (msg: string) => console.log(chalk.red('✖'), chalk.red(msg)),
  step: (msg: string) => console.log(chalk.cyan('→'), chalk.cyan(msg)),
  messageBlock: (messages: { role: string; content: any }[]) => {
    messages.forEach(({ role, content }) => {
      const roleColor = role === 'system' ? chalk.magenta : 
                       role === 'agent' ? chalk.green : 
                       chalk.blue;
      const contentStr = typeof content === 'string' ? content :
                        Array.isArray(content) ? content.map(c => c.text).join('\n') :
                        JSON.stringify(content, null, 2);
      console.log(
        roleColor(`${role.toUpperCase()}:`),
        contentStr.split('\n').map(line => '  ' + line).join('\n')
      );
    });
  }
};

// Define the state schema
const agentStateSchema = z.object({
  messages: z.array(z.any()),
  currentStep: z.string(),
  lastAction: z.string().optional(),
  positions: z.array(z.any()).optional(),
  markets: z.array(z.any()).optional()
});

type NodeName = typeof START | typeof END | "settle_positions" | "assess_positions" | "discover_markets" | "publish_summary" | "tools";

export class FoilAgent {
  private graph: RunnableSequence;
  private stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName>;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private isIterationRunning: boolean = false;  // Add lock for iterations
  private model: ChatOpenAI | ChatOllama;
  private toolNode: ToolNode;

  constructor(
    private config: AgentConfig,
    private tools: AgentTools
  ) {
    log.info("Initializing FoilAgent with config:");
    log.info(JSON.stringify(config, null, 2));
    if (config.useOllama) {
      log.info(`Using Ollama model: ${config.ollamaModel || "llama2"}`);
      this.model = new ChatOllama({
        model: config.ollamaModel || "llama2",
        baseUrl: config.ollamaBaseUrl,
        temperature: 0,
      });
    } else {
      log.info("Using OpenAI model");
      this.model = new ChatOpenAI({
        modelName: "gpt-4",
        temperature: 0,
        openAIApiKey: config.openaiApiKey,
      });
    }

    log.info("Converting tools to LangChain tools...");
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
    log.info(`Tools converted: ${langChainTools.map(t => t.name).join(', ')}`);

    // Initialize tool node
    log.info("Initializing tool node...");
    this.toolNode = new ToolNode(langChainTools);

    log.info("Building graph...");
    const { graph, stateGraph } = this.buildGraph();
    this.graph = graph;
    this.stateGraph = stateGraph;
    log.success("Graph built successfully");
  }

  private buildGraph(): { graph: any; stateGraph: StateGraph<typeof agentStateSchema, any, any, NodeName> } {
    log.info("Creating new StateGraph...");
    const stateGraph = new StateGraph<typeof agentStateSchema, any, any, NodeName>(agentStateSchema);

    // Define the nodes
    log.info("Defining nodes...");
    const settlePositions = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Settle] Analyzing positions for settlement...');
      
      const prompt = `You are a Foil trading agent. Your task is to analyze and settle positions using the provided tools.
        You have access to these tools:
        - get_foil_position: Get information about a specific position
        - get_foil_position_pnl: Get the PnL of a position
        - settle_foil_position: Settle a position
        
        Current state:
        - Step: ${state.currentStep}
        - Last action: ${state.lastAction || 'None'}
        - Number of positions: ${state.positions?.length || 0}
        
        Instructions:
        1. Use get_foil_position to check existing positions
        2. For each position, use get_foil_position_pnl to assess if it should be settled
        3. If a position should be settled, use settle_foil_position
        4. Explain your reasoning and actions clearly
        
        Respond with your analysis and planned actions.`;
      
      const response = await this.model.invoke([
        ...state.messages,
        new SystemMessage(prompt)
      ]);

      log.messageBlock([
        { role: 'system', content: prompt },
        { role: 'agent', content: response.content }
      ]);

      // Only update messages once
      return {
        messages: [...state.messages, response],
        currentStep: 'settle_positions',
        lastAction: 'analyze_positions',
        positions: state.positions,
        markets: state.markets
      };
    };

    const assessPositions = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Assess] Evaluating current positions...');
      
      const prompt = `You are a Foil trading agent. Your task is to assess and modify positions using the provided tools.
        You have access to these tools:
        - get_foil_position: Get information about a specific position
        - get_foil_position_pnl: Get the PnL of a position
        - quote_modify_foil_trader_position: Get a quote for modifying a position
        - modify_foil_trader_position: Modify an existing position
        
        Current state:
        - Step: ${state.currentStep}
        - Last action: ${state.lastAction || 'None'}
        - Number of positions: ${state.positions?.length || 0}
        
        Instructions:
        1. Use get_foil_position to check existing positions
        2. For each position, use get_foil_position_pnl to assess if it needs modification
        3. If a position needs modification, use quote_modify_foil_trader_position first
        4. If the quote looks good, use modify_foil_trader_position
        5. Explain your reasoning and actions clearly
        
        Respond with your analysis and planned actions.`;
      
      const response = await this.model.invoke([
        ...state.messages,
        new SystemMessage(prompt)
      ]);

      log.messageBlock([
        { role: 'system', content: prompt },
        { role: 'agent', content: response.content }
      ]);

      return {
        messages: [...state.messages, response],
        currentStep: 'assess_positions',
        lastAction: 'analyze_positions',
        positions: state.positions,
        markets: state.markets
      };
    };

    const discoverMarkets = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Discover] Searching for market opportunities...');
      
      const prompt = `You are a Foil trading agent. Your task is to discover and analyze market opportunities using the provided tools.
        You have access to these tools:
        - get_foil_market_info: Get information about a specific market
        - get_foil_latest_period_info: Get the latest period information
        - quote_create_foil_trader_position: Get a quote for creating a new position
        - create_foil_trader_position: Create a new position
        
        Current state:
        - Step: ${state.currentStep}
        - Last action: ${state.lastAction || 'None'}
        - Number of markets: ${state.markets?.length || 0}
        
        Instructions:
        1. Use get_foil_market_info to analyze available markets
        2. For promising markets, use get_foil_latest_period_info to check current conditions
        3. If a market looks good, use quote_create_foil_trader_position first
        4. If the quote looks good, use create_foil_trader_position
        5. Explain your reasoning and actions clearly
        
        Respond with your analysis and planned actions.`;
      
      const response = await this.model.invoke([
        ...state.messages,
        new SystemMessage(prompt)
      ]);

      log.messageBlock([
        { role: 'system', content: prompt },
        { role: 'agent', content: response.content }
      ]);

      return {
        messages: [...state.messages, response],
        currentStep: 'discover_markets',
        lastAction: 'analyze_markets',
        positions: state.positions,
        markets: state.markets
      };
    };

    const publishSummary = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Summary] Generating trading session summary...');
      
      const prompt = `You are a Foil trading agent. Create a comprehensive summary of the trading session.
        Use these tools to gather information:
        - get_foil_position: Get information about positions
        - get_foil_position_pnl: Get PnL information
        - get_foil_market_info: Get market information
        
        Current state:
        - Step: ${state.currentStep}
        - Last action: ${state.lastAction || 'None'}
        - Number of positions: ${state.positions?.length || 0}
        - Number of markets: ${state.markets?.length || 0}
        
        Instructions:
        1. Use the tools to gather current state information
        2. Summarize all actions taken in the session
        3. Provide current portfolio state and risk metrics
        4. Give recommendations for next steps
        5. Format your response clearly with sections
        
        Provide a detailed summary of the trading session.`;
      
      const response = await this.model.invoke([
        ...state.messages,
        new SystemMessage(prompt)
      ]);

      log.messageBlock([
        { role: 'system', content: prompt },
        { role: 'agent', content: response.content }
      ]);

      return {
        messages: [...state.messages, response],
        currentStep: 'publish_summary',
        lastAction: 'generate_summary',
        positions: state.positions,
        markets: state.markets
      };
    };

    // Add nodes to the graph
    log.info("Adding nodes to graph...");
    stateGraph.addNode("settle_positions", settlePositions);
    stateGraph.addNode("assess_positions", assessPositions);
    stateGraph.addNode("discover_markets", discoverMarkets);
    stateGraph.addNode("publish_summary", publishSummary);
    stateGraph.addNode("tools", this.toolNode);
    log.success("Nodes added successfully");

    // Define conditional edges
    log.info("Defining conditional edges...");
    const shouldContinueSettling = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Settle] Checking if more settlement needed...');
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for settling positions
      if (lastMessage.tool_calls?.length > 0) {
        log.info("Tool calls found, continuing with tools");
        return "tools";
      }

      // Check if there are still settleable positions
      const positions = this.parsePositionsFromMessages(state.messages);
      const settleablePositions = positions.filter(p => p.isSettleable);
      
      const result = settleablePositions.length > 0 ? "settle_positions" : "assess_positions";
      log.info(`Settlement check result: ${result}`);
      return result;
    };

    const shouldContinueAssessing = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Assess] Checking if more assessment needed...');
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for assessing positions
      if (lastMessage.tool_calls?.length > 0) {
        log.info("Tool calls found, continuing with tools");
        return "tools";
      }

      // Check if we need more assessment
      const result = lastMessage.content.includes("Action taken") ? "assess_positions" : "discover_markets";
      log.info(`Assessment check result: ${result}`);
      return result;
    };

    const shouldContinueDiscovering = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Discover] Checking if more discovery needed...');
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Check if the LLM made tool calls for discovering markets
      if (lastMessage.tool_calls?.length > 0) {
        log.info("Tool calls found, continuing with tools");
        return "tools";
      }

      // Check if we need more discovery
      const discoveryMessages = state.messages.filter(m => 
        m.content.includes("Discovering new markets")
      );
      const result = discoveryMessages.length < 5 ? "discover_markets" : "publish_summary";
      log.info(`Discovery check result: ${result}`);
      return result;
    };

    const shouldUseTools = async (state: z.infer<typeof agentStateSchema>) => {
      log.step('[Tools] Checking if tools are needed...');
      const lastMessage = state.messages[state.messages.length - 1];
      
      // If there are tool calls, continue using tools
      if (lastMessage.tool_calls?.length > 0) {
        log.info("Tool calls found, continuing with tools");
        return "tools";
      }

      // Otherwise, return to the previous node
      const previousNode = state.messages[state.messages.length - 2]?.content;
      let result;
      if (previousNode?.includes("settle_positions")) result = "settle_positions";
      else if (previousNode?.includes("assess_positions")) result = "assess_positions";
      else if (previousNode?.includes("discover_markets")) result = "discover_markets";
      else result = "publish_summary";
      
      log.info(`Tools check result: ${result}`);
      return result;
    };

    // Add edges with conditional routing
    log.info("Adding conditional edges...");
    stateGraph.addConditionalEdges("settle_positions", shouldContinueSettling);
    stateGraph.addConditionalEdges("assess_positions", shouldContinueAssessing);
    stateGraph.addConditionalEdges("discover_markets", shouldContinueDiscovering);
    stateGraph.addConditionalEdges("tools", shouldUseTools);
    log.success("Conditional edges added");

    // Add regular edges between nodes
    log.info("Adding regular edges...");
    stateGraph.addEdge("settle_positions", "assess_positions");
    stateGraph.addEdge("assess_positions", "discover_markets");
    stateGraph.addEdge("discover_markets", "publish_summary");
    stateGraph.addEdge("tools", "settle_positions");
    stateGraph.addEdge("tools", "assess_positions");
    stateGraph.addEdge("tools", "discover_markets");
    log.success("Regular edges added");

    // Set up entry and final nodes
    log.info("Setting up entry and final nodes...");
    stateGraph.setEntryPoint("settle_positions");
    stateGraph.setFinishPoint("publish_summary");

    // Compile the graph
    log.info("Compiling graph...");
    const graph = stateGraph.compile();
    log.success("Graph compiled successfully");

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

  private async runIteration() {
    if (this.isIterationRunning) {
      log.warn("Previous iteration still running, skipping this iteration");
      return;
    }

    this.isIterationRunning = true;
    try {
      log.info("Starting new trading iteration");
      const state = await this.initializeState();
      
      const finalState = await this.graph.invoke(state);
      log.success("Trading iteration completed");
      
      // Only log the final summary message
      const lastMessage = finalState.messages[finalState.messages.length - 1];
      if (lastMessage) {
        log.step('[Final Summary]');
        log.messageBlock([
          { role: lastMessage.type, content: lastMessage.content }
        ]);
      }
    } catch (error) {
      log.error(`Error in trading iteration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isIterationRunning = false;
    }
  }

  private async initializeState(): Promise<z.infer<typeof agentStateSchema>> {
    log.step('[Initialize] Starting new trading session...');
    
    const systemMessage = new SystemMessage(
      `You are a Foil trading agent responsible for analyzing market conditions and managing trading positions. Your tasks include:
      1. Settling positions when appropriate
      2. Assessing and modifying existing positions
      3. Discovering new market opportunities
      4. Publishing trading summaries
      
      Use the available tools to interact with the Foil protocol and make trading decisions.`
    );

    return {
      messages: [systemMessage],
      currentStep: 'initialize',
      positions: [],
      markets: []
    };
  }

  public async start() {
    if (this.isRunning) {
      log.warn("Agent is already running");
      return;
    }

    this.isRunning = true;
    log.info(chalk.bold("Starting Foil trading agent..."));

    // Run immediately on start
    await this.runIteration();

    // Only set up interval if it's greater than 0
    if (this.config.interval > 0) {
      log.info(`Setting up trading interval of ${chalk.bold(this.config.interval + 'ms')}`);
      this.interval = setInterval(async () => {
        if (this.isRunning) {  // Check if still running before starting new iteration
          await this.runIteration();
        }
      }, this.config.interval);
    } else {
      log.info("Running in one-time mode");
      this.stop();
    }
  }

  public stop() {
    if (!this.isRunning) {
      log.warn("Agent is not running");
      return;
    }

    this.isRunning = false;  // Set this first to prevent new iterations from starting

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Wait for any running iteration to complete
    if (this.isIterationRunning) {
      log.info("Waiting for current iteration to complete...");
      const checkInterval = setInterval(() => {
        if (!this.isIterationRunning) {
          clearInterval(checkInterval);
          log.success("Stopped Foil trading agent");
        }
      }, 100);
    } else {
      log.success("Stopped Foil trading agent");
    }
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
      log.success(`Graph visualization saved to ${filePath}`);
      log.info("Note: You can visualize this graph by copying the contents to a Mermaid editor (e.g., https://mermaid.live)");
    } catch (error) {
      log.error("Error saving graph visualization:");
      log.error(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
} 