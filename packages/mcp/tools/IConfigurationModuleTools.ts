// MCP Tool for IConfigurationModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Parse the ABI from the JSON strings
const parsedABI = abiJson.IConfigurationModule.map(item => JSON.parse(item));

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
export const IConfigurationModuleTools = {
  initializeMarket: {
    description: "Call initializeMarket function on IConfigurationModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        owner: {
          type: "string",
          description: "Address of a market owner, which can update the configurations and submit a settlement price",
        },
        collateralAsset: {
          type: "string",
          description: "Address of the collateral used by the market. This cannot be a rebase token.",
        },
        feeCollectors: {
          type: "string[]",
          description: "Addresses of fee collectors",
        },
        callbackRecipient: {
          type: "string",
          description: "recipient of callback on resolution of epoch, can be address(0)",
        },
        minTradeSize: {
          type: "string",
          description: "Minimum trade size for a position",
        },
        marketParams: {
          type: "any",
          description: "Parameters used when new epochs are created",
        },
      },
      required: ["contractAddress", "owner", "collateralAsset", "feeCollectors", "callbackRecipient", "minTradeSize", "marketParams"]
    },
    function: async ({ contractAddress, owner, collateralAsset, feeCollectors, callbackRecipient, minTradeSize, marketParams }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "initializeMarket",
          args: [owner, collateralAsset, feeCollectors, callbackRecipient, BigInt(minTradeSize), marketParams]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  updateMarket: {
    description: "Call updateMarket function on IConfigurationModule contract",
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
          functionName: "updateMarket",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  createEpoch: {
    description: "Call createEpoch function on IConfigurationModule contract",
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
          functionName: "createEpoch",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
