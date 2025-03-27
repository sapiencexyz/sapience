import { BaseMessage } from "@langchain/core/messages";
import { Tool } from "@langchain/core/tools";

export interface AgentState {
  messages: BaseMessage[];
  positions: Position[];
  markets: Market[];
  actions: Action[];
}

export interface Position {
  id: string;
  market: string;
  size: string;
  collateral: string;
  pnl: string;
  isSettleable: boolean;
}

export interface Market {
  address: string;
  chainId: number;
  isActive: boolean;
  currentEpoch: string;
}

export interface Action {
  type: 'SETTLE' | 'CREATE_POSITION' | 'MODIFY_POSITION';
  positionId?: string;
  marketAddress?: string;
  size?: string;
  collateral?: string;
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
import * as graphqlTools from '../tools/graphql';
import * as readFoilTools from '../tools/readFoilContracts';
import * as writeFoilTools from '../tools/writeFoilContracts';

export interface AgentTools {
  graphql: typeof graphqlTools;
  writeFoilContracts: typeof writeFoilTools;
  readFoilContracts: typeof readFoilTools;
} 