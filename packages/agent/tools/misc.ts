import { http, encodeFunctionData, createPublicClient } from 'viem';
import { erc20Abi } from 'viem'
import { base } from 'viem/chains';

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