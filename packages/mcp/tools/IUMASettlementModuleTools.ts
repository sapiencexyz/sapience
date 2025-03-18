// MCP Tool for IUMASettlementModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Process ABI and handle struct types
const parsedABI = abiJson.map(item => {
  // Convert struct types to tuples
  if (item.type === 'function') {
    item.inputs = item.inputs.map((input: any) => {
      if (input.internalType?.startsWith('struct ')) {
        return { ...input, type: 'tuple' };
      }
      return input;
    });
    item.outputs = item.outputs.map((output: any) => {
      if (output.internalType?.startsWith('struct ')) {
        return { ...output, type: 'tuple' };
      }
      return output;
    });
  }
  return item;
}).filter(item => item.type === 'function');

// Configure viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
const hasPrivateKey = !!privateKey;
const walletClient = hasPrivateKey ? createWalletClient({
  account: privateKeyToAccount(privateKey as `0x${string}`),
  chain: base,
  transport: http()
}) : null;

// MCP Tool Definitions
export const IUMASettlementModuleTools = {
  submitSettlementPrice: {
    description: "Call submitSettlementPrice function on IUMASettlementModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "submitSettlementPrice",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  assertionResolvedCallback: {
    description: "Call assertionResolvedCallback function on IUMASettlementModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "assertionResolvedCallback",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  assertionDisputedCallback: {
    description: "Call assertionDisputedCallback function on IUMASettlementModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "assertionDisputedCallback",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
