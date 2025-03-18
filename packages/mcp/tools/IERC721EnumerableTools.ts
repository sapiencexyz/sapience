// MCP Tool for IERC721Enumerable
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Helper function to convert BigInts to strings in objects
function replaceBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    if (Array.isArray(obj)) {
        return obj.map(replaceBigInts);
    }
    if (typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, replaceBigInts(value)])
        );
    }
    return obj;
}

// Process ABI and handle struct types
const parsedABI = abiJson.map(item => {
  // Convert struct types to tuples
  if (item.type === 'function') {
    item.inputs = item.inputs.map((input: any) => {
      if (input.internalType?.startsWith('struct ')) {
        const structName = input.internalType.split('struct ')[1];
        if (structName.includes('.')) {
          const [_, actualStructName] = structName.split('.');
          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);
          if (structDef) {
            return { ...input, type: 'tuple', components: structDef.members };
          }
        }
      }
      return input;
    });
    item.outputs = item.outputs.map((output: any) => {
      if (output.internalType?.startsWith('struct ')) {
        const structName = output.internalType.split('struct ')[1];
        if (structName.includes('.')) {
          const [_, actualStructName] = structName.split('.');
          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);
          if (structDef) {
            return { ...output, type: 'tuple', components: structDef.members };
          }
        }
      }
      return output;
    });
  }
  return item;
});

// Filter ABI to only include functions
const functionABI = parsedABI.filter(item => item.type === 'function');

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
export const IERC721EnumerableTools = {
  totalSupply: {
    description: "Returns the total amount of tokens stored by the contract.",
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
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "totalSupply",
          args: []
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  tokenOfOwnerByIndex: {
    description: "Returns a token ID owned by `owner` at a given `index` of its token list.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        owner: {
          type: "string",
        },
        index: {
          type: "string",
        },
      },
      required: ["contractAddress", "owner", "index"]
    },
    function: async ({ contractAddress, owner, index }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "tokenOfOwnerByIndex",
          args: [owner, BigInt(index)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  tokenByIndex: {
    description: "Returns a token ID at a given `index` of all the tokens stored by the contract.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        index: {
          type: "string",
        },
      },
      required: ["contractAddress", "index"]
    },
    function: async ({ contractAddress, index }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "tokenByIndex",
          args: [BigInt(index)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
