import { http, encodeFunctionData, createPublicClient } from 'viem';
import { erc20Abi } from 'viem'
import { base } from 'viem/chains';

const FOIL_API_BASE_URL = process.env.FOIL_API_URL || 'https://api.foil.xyz';

export const approveToken = {
  name: "approve_token",
  description: "Returns the calldata for an ERC-20 approval",
  parameters: {
    properties: {
      tokenAddress: {
        type: "string",
        description: "The address of the ERC-20 token to approve"
      },
      spender: {
        type: "string",
        description: "The address to approve to spend the tokens"
      },
      amount: {
        type: "string",
        description: "The amount of tokens to approve"
      }
    },
    required: ["tokenAddress", "spender", "amount"],
  },
  function: async (args: { tokenAddress: string; spender: string; amount: string }) => {
    try {
      const calldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [args.spender as `0x${string}`, BigInt(args.amount)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.tokenAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding approve: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const balanceOfToken = {
  name: "balance_of_token",
  description: "Reads the ERC-20 token balance of an owner on the Base chain",
  parameters: {
    properties: {
      tokenAddress: {
        type: "string",
        description: "The address of the ERC-20 token"
      },
      ownerAddress: {
        type: "string",
        description: "The address of the owner"
      }
    },
    required: ["tokenAddress", "ownerAddress"],
  },
  function: async (args: { tokenAddress: string; ownerAddress: string }) => {
    try {

      const publicClient = createPublicClient({
        chain: base,
        transport: process.env.TRANSPORT_URL ? http(process.env.TRANSPORT_URL) : http()
      });

      const balance = await publicClient.readContract({
        address: args.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [args.ownerAddress as `0x${string}`]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ balance: balance.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error reading token balance: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
}; 

export const getSizeForCreateTraderPosition = {
  name: "get_size_for_create_trader_position",
  description: "Gets the ideal size parameterfor a new trader position based on a prediction/answer",
  parameters: {
    properties: {
      chainId: {
        type: "string",
        description: "The ID of the chain"
      },
      marketAddress: {
        type: "string", 
        description: "The address of the market"
      },
      epochId: {
        type: "string",
        description: "The ID of the period"
      },
      collateralAvailable: {
        type: "string",
        description: "The amount of collateral available"
      },
      prediction: {
        type: "string",
        description: "The expected outcome of the market"
      },
    },
    required: ["chainId", "marketAddress", "epochId", "collateralAvailable", "prediction"],
  },
  function: async (args: { chainId: string; marketAddress: string; epochId: string; collateralAvailable: string; prediction: string }) => { 
    if (!args) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: args required"
        }], 
        isError: true
      };
    }
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: "Error: args must be an object"
          }],
          isError: true
        };
      }
    }

    // Validate required parameters
    if (!args.chainId) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: chainId is required"
        }],
        isError: true
      };
    }
    if (!args.marketAddress) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: marketAddress is required"
        }],
        isError: true
      };
    }
    if (!args.epochId) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: epochId is required"
        }],
        isError: true
      };
    }
    if (!args.collateralAvailable) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: collateralAvailable is required"
        }], 
        isError: true
      };
    }
    if (!args.prediction) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: prediction is required"
        }],
        isError: true
      };
    }

    try {
      const response = await fetch(`${FOIL_API_BASE_URL}/quoter/${args.chainId}/${args.marketAddress}/${args.epochId}?collateralAvailable=${args.collateralAvailable}&prediction=${args.prediction}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quoter data: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const maxSize = BigInt(result.maxSize);
      const isLong = Boolean(result.isLong);

      if (isLong) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              maxSize: maxSize.toString()
            }, null, 2)
          }]
        };
      } else {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              maxSize: (-maxSize).toString()
            }, null, 2)
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error getting max size for createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};