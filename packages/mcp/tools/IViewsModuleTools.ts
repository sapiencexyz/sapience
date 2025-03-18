// MCP Tool for IViewsModule
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
export const IViewsModuleTools = {
  getMarket: {
    description: "Call getMarket function on IViewsModule contract",
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
          functionName: "getMarket",
          args: []
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getEpoch: {
    description: "Call getEpoch function on IViewsModule contract",
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
          functionName: "getEpoch",
          args: []
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getLatestEpoch: {
    description: "Call getLatestEpoch function on IViewsModule contract",
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
          functionName: "getLatestEpoch",
          args: []
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getPosition: {
    description: "Call getPosition function on IViewsModule contract",
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
          abi: functionABI,
          functionName: "getPosition",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getPositionSize: {
    description: "Call getPositionSize function on IViewsModule contract",
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
          abi: functionABI,
          functionName: "getPositionSize",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getSqrtPriceX96: {
    description: "Call getSqrtPriceX96 function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "id of the epoch to get the reference price",
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "getSqrtPriceX96",
          args: [BigInt(epochId)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getReferencePrice: {
    description: "Call getReferencePrice function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "id of the epoch to get the reference price",
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "getReferencePrice",
          args: [BigInt(epochId)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getPositionCollateralValue: {
    description: "Call getPositionCollateralValue function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "id of the position",
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "getPositionCollateralValue",
          args: [BigInt(positionId)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getPositionPnl: {
    description: "Call getPositionPnl function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "id of the position",
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "getPositionPnl",
          args: [BigInt(positionId)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getMarketTickSpacing: {
    description: "Call getMarketTickSpacing function on IViewsModule contract",
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
          functionName: "getMarketTickSpacing",
          args: []
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
