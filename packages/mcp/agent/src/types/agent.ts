import { AgentMessage } from './message.js';
import { Position, Action } from './position.js';
import { Market as MarketType } from './market.js';

export interface AgentState {
  messages: AgentMessage[];
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
  openaiApiKey: string;
  useOllama?: boolean;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
}

// Import the actual tool types from the MCP tools
import * as graphqlTools from '../../../tools/graphql.js';
import * as readFoilTools from '../../../tools/readFoilContracts.js';
import * as writeFoilTools from '../../../tools/writeFoilContracts.js';

export interface AgentTools {
  graphql: typeof graphqlTools;
  writeFoilContracts: typeof writeFoilTools;
  readFoilContracts: typeof readFoilTools;
} 