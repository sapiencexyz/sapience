import { Logger } from "../utils/logger";
import { AgentConfig, AgentState, AgentTools } from "../types/agent";
import { z } from "zod";
import chalk from 'chalk';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { NonModelBaseNode } from "./base";

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the correct path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Define the state schema for lookup
const lookupStateSchema = z.object({
  messages: z.array(z.any()),
  toolResults: z.record(z.any()).optional(),
  positions: z.array(z.any()),
  agentAddress: z.string()
});

type LookupState = z.infer<typeof lookupStateSchema>;

export class LookupNode extends NonModelBaseNode {
  private agentAddress: string;

  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
    
    Logger.setDebugMode(false);
    
    // Get private key from environment variables
    const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETHEREUM_PRIVATE_KEY environment variable is not set');
    }

    // Get public key from private key using viem
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    this.agentAddress = account.address;
    Logger.info(`Agent address: ${this.agentAddress}`);
  }

  public async execute(state: AgentState): Promise<AgentState> {
    try {
      Logger.step('[Lookup] Searching for positions...');


      // Get all active markets using GraphQL
      const marketsQuery = `
        query GetMarkets {
          markets {
            id
            name
            baseToken {
              symbol
            }
            quoteToken {
              symbol
            }
            isActive
            currentPrice
            fundingRate
            openInterest
          }
        }
      `;
      const marketsResult = await this.tools.graphql.query.function({ query: marketsQuery });
      const activeMarkets = marketsResult?.data?.markets || [];

      // Update state with positions and markets
      const updatedState = {
        ...state,
        markets: activeMarkets,
        agentAddress: this.agentAddress
      };

      Logger.info(`Found ${activeMarkets.length} active markets.`);

      return updatedState;
    } catch (error) {
      Logger.error(`Error in LookupNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 