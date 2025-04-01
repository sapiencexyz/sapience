import { AgentMessage } from './message.js';
import { Position, Action } from './position.js';
import { Market as MarketType } from './market.js';
import { DynamicTool } from "@langchain/core/tools";
import { BaseMessage } from "@langchain/core/messages";

export interface AgentState {
  messages: BaseMessage[];
  positions: Position[];
  markets: MarketType[];
  previousMarkets?: MarketType[];
  actions: Action[];
  currentStep: string;
  lastAction?: string;
  toolResults: Record<string, any>;
  agentAddress: string;
  shouldRePrompt?: boolean;
}

export interface AgentConfig {
  interval: number; // in milliseconds
  anthropicApiKey: string;
  useOllama?: boolean;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Define the base tool interface
export interface BaseTool {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  function: (args: Record<string, unknown>) => Promise<any>;
}

export interface AgentTools {
  graphql: Record<string, BaseTool>;
  writeFoilContracts: Record<string, BaseTool>;
  readFoilContracts: Record<string, BaseTool>;
}

// Helper function to convert our tools to LangChain tools
export function convertToLangChainTools(tools: Record<string, BaseTool>): DynamicTool[] {
  return Object.values(tools).map(tool => new DynamicTool({
    name: tool.name,
    description: tool.description,
    func: async (input: string) => {
      try {
        // If the tool has no required parameters, we can call it with an empty object
        if (tool.parameters.required.length === 0) {
          const result = await tool.function({});
          return JSON.stringify(result);
        }
        
        // Otherwise, parse the input as JSON
        const args = JSON.parse(input);
        const result = await tool.function(args);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    },
  }));
} 