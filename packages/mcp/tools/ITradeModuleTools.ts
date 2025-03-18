// MCP Tool for ITradeModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import ITradeModuleABI from '../out/ITradeModule.ast.json';

// Configure viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error('PRIVATE_KEY environment variable is required for write operations');
}

// Create wallet client
const account = privateKeyToAccount(privateKey as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http()
});

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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "createTraderPosition",
args: [BigInt(epochId), BigInt(size), BigInt(maxCollateral), BigInt(deadline)],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ITradeModuleABI),
          functionName: "createTraderPosition",
args: [BigInt(epochId), BigInt(size), BigInt(maxCollateral), BigInt(deadline)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called createTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "modifyTraderPosition",
args: [BigInt(positionId), BigInt(size), BigInt(deltaCollateralLimit), BigInt(deadline)],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ITradeModuleABI),
          functionName: "modifyTraderPosition",
args: [BigInt(positionId), BigInt(size), BigInt(deltaCollateralLimit), BigInt(deadline)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called modifyTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteCreateTraderPosition",
args: [BigInt(epochId), BigInt(size)],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteCreateTraderPosition",
args: [BigInt(epochId), BigInt(size)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called quoteCreateTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteModifyTraderPosition",
args: [BigInt(positionId), BigInt(size)],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteModifyTraderPosition",
args: [BigInt(positionId), BigInt(size)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called quoteModifyTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
