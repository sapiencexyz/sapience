import {
  http,
  encodeFunctionData,
  createPublicClient,
  extractChain,
} from 'viem';
import * as allChains from 'viem/chains';
import { erc20Abi } from 'viem';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Function to get chain object by ID
const getChainById = (chainId: string) => {
  const numericChainId = parseInt(chainId, 10);
  // Create an array of all chain objects
  const chainsArray = Object.values(allChains);
  // Find the chain with the matching ID
  const chain = extractChain({
    chains: chainsArray,
    // @ts-expect-error: Chain ID is dynamically provided and may not match the exact union type
    id: numericChainId,
  });
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return chain;
};

export const approveToken = {
  name: 'approve_token',
  description: 'Returns the calldata for an ERC-20 approval',
  parameters: {
    properties: {
      tokenAddress: z
        .string()
        .describe('The address of the ERC-20 token to approve'),
      spender: z
        .string()
        .describe('The address to approve to spend the tokens'),
      amount: z.string().describe('The amount of tokens to approve'),
    },
  },
  function: async (args: {
    tokenAddress: string;
    spender: string;
    amount: string;
  }): Promise<CallToolResult> => {
    try {
      const calldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [args.spender as `0x${string}`, BigInt(args.amount)],
      });

      const result = {
        to: args.tokenAddress,
        data: calldata,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding approve: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const balanceOfToken = {
  name: 'balance_of_token',
  description: 'Reads the ERC-20 token balance of an owner',
  parameters: {
    properties: {
      tokenAddress: z.string().describe('The address of the ERC-20 token'),
      ownerAddress: z.string().describe('The address of the owner'),
      chainId: z.string().describe('The chain ID to read the balance from'),
    },
  },
  function: async (args: {
    tokenAddress: string;
    ownerAddress: string;
    chainId: string;
  }): Promise<CallToolResult> => {
    console.log('LLL (balanceOfToken):', args);
    const { tokenAddress, ownerAddress, chainId } = args;
    try {
      const chain = getChainById(chainId);

      const publicClient = createPublicClient({
        chain: chain,
        transport: process.env.TRANSPORT_URL
          ? http(process.env.TRANSPORT_URL)
          : http(),
      });

      const balance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [ownerAddress as `0x${string}`],
      });

      const result = { balance: balance.toString() };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading token balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const quoteViaQuoter = {
  name: 'get_sapience_quote',
  description: 'Gets a quote for a transaction via the Quoter API',
  parameters: {
    properties: {
      chainId: z
        .string()
        .describe('The chain ID to quote the transaction from'),
      marketGroupAddress: z
        .string()
        .describe(
          'The address of the market group to quote the transaction for'
        ),
      marketId: z
        .string()
        .describe('The ID of the market to quote the transaction for'),
      expectedPrice: z.string().transform(Number),
      collateralAvailable: z.string().transform(BigInt),
      maxIterations: z.string().transform(Number).optional(),
      priceLimit: z.string().transform(Number).optional(),
    },
  },
  function: async (args: {
    chainId: string;
    marketGroupAddress: string;
    marketId: string;
    expectedPrice: number;
    collateralAvailable: bigint;
    maxIterations: number | undefined;
    priceLimit: number | undefined;
  }): Promise<CallToolResult> => {
    try {
      const {
        chainId,
        marketGroupAddress,
        marketId,
        expectedPrice,
        collateralAvailable,
        maxIterations,
        priceLimit,
      } = args;

      const params = new URLSearchParams();
      params.append('expectedPrice', expectedPrice.toString());
      params.append('collateralAvailable', collateralAvailable.toString());
      if (maxIterations) {
        params.append('maxIterations', maxIterations.toString());
      }
      if (priceLimit) {
        params.append('priceLimit', priceLimit.toString());
      }

      const url = `${API_URL}/quoter/${chainId}/${marketGroupAddress}/${marketId}/?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};
