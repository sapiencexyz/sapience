// MCP Tool for ISettlementModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import ISettlementModuleABI from '../out/ISettlementModule.ast.json';

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
export const ISettlementModuleTools = {
  settlePosition: {
    description: "Call settlePosition function on ISettlementModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "The ID of the position to settle",
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      if (!hasPrivateKey) {
        return { error: "Write operations require PRIVATE_KEY environment variable" };
      }

      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ISettlementModuleABI),
          functionName: "settlePosition",
args: [BigInt(positionId)],
        });

        // Send transaction
        const hash = await walletClient!.writeContract({
          address: contractAddress,
          abi: parseAbi(ISettlementModuleABI),
          functionName: "settlePosition",
args: [BigInt(positionId)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called settlePosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  __manual_setSettlementPrice: {
    description: "Call __manual_setSettlementPrice function on ISettlementModule contract",
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
        return { error: "Write operations require PRIVATE_KEY environment variable" };
      }

      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ISettlementModuleABI),
          functionName: "__manual_setSettlementPrice",
        });

        // Send transaction
        const hash = await walletClient!.writeContract({
          address: contractAddress,
          abi: parseAbi(ISettlementModuleABI),
          functionName: "__manual_setSettlementPrice",
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called __manual_setSettlementPrice on ${contractAddress}`
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
