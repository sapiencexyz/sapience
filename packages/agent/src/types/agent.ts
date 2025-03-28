import { AgentMessage } from './message.js';
import { Position, Action } from './position.js';
import { Market as MarketType } from './market.js';
import { DynamicTool } from "@langchain/core/tools";
import { BaseMessage } from "@langchain/core/messages";

export interface AgentState {
  messages: BaseMessage[];
  positions: Position[];
  markets: MarketType[];
  actions: Action[];
  currentStep: string;
  lastAction?: string;
}

export interface AgentConfig {
  interval: number; // in milliseconds
  maxPositionsPerMarket: number;
  minCollateral: string;
  maxCollateral: string;
  targetLeverage: number;
  anthropicApiKey: string;
  useOllama?: boolean;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
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

// Import the actual tool types from the MCP tools
import * as graphqlTools from '../../tools/graphql.js';
import * as readFoilTools from '../../tools/readFoilContracts.js';
import * as writeFoilTools from '../../tools/writeFoilContracts.js';

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