// MCP Tool for ITradeModule
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
export const ITradeModuleTools = {
  createTraderPosition: {
    description: "Create a new trader position.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "The epoch id.",
        },
        size: {
          type: "string",
          description: "The position size.",
        },
        maxCollateral: {
          type: "string",
          description: "The maximum collateral that can be deposited. If 0, no limit.",
        },
        deadline: {
          type: "string",
          description: "The deadline for the transaction.",
        },
      },
      required: ["contractAddress", "epochId", "size", "maxCollateral", "deadline"]
    },
    function: async ({ contractAddress, epochId, size, maxCollateral, deadline }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "createTraderPosition",
          args: [BigInt(epochId), BigInt(size), BigInt(maxCollateral), BigInt(deadline)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  modifyTraderPosition: {
    description: "Modify an existing trader position.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "The position id.",
        },
        size: {
          type: "string",
          description: "The new position size.",
        },
        deltaCollateralLimit: {
          type: "string",
          description: "The change in the collateral limit. Positive for adding collateral, negative for reomving (closing a position means minimum profit to withdraw). If 0, no limit.",
        },
        deadline: {
          type: "string",
          description: "The deadline for the transaction.",
        },
      },
      required: ["contractAddress", "positionId", "size", "deltaCollateralLimit", "deadline"]
    },
    function: async ({ contractAddress, positionId, size, deltaCollateralLimit, deadline }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "modifyTraderPosition",
          args: [BigInt(positionId), BigInt(size), BigInt(deltaCollateralLimit), BigInt(deadline)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  quoteCreateTraderPosition: {
    description: "warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "The epoch id.",
        },
        size: {
          type: "string",
          description: "The position size.",
        },
      },
      required: ["contractAddress", "epochId", "size"]
    },
    function: async ({ contractAddress, epochId, size }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "quoteCreateTraderPosition",
          args: [BigInt(epochId), BigInt(size)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  quoteModifyTraderPosition: {
    description: "warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "The position id.",
        },
        size: {
          type: "string",
          description: "The new position size.",
        },
      },
      required: ["contractAddress", "positionId", "size"]
    },
    function: async ({ contractAddress, positionId, size }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "quoteModifyTraderPosition",
          args: [BigInt(positionId), BigInt(size)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
