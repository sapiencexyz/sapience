import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import FoilABI from '../Foil.json';

// Create a public client for interacting with the blockchain
const client = createPublicClient({
  chain: base,
  transport: http()
});

interface PositionData {
  id: bigint;
  kind: number;
  epochId: bigint;
  depositedCollateralAmount: bigint;
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  vEthAmount: bigint;
  vGasAmount: bigint;
  uniswapPositionId: bigint;
  isSettled: boolean;
}

export const getMarketInfo = {
  name: "get_foil_market_info",
  description: "Gets detailed information about a market's configuration",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to get information about"
      }
    },
    required: ["marketAddress"],
  },
  function: async (args: { marketAddress: string }) => {
    try {
      const marketInfo = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getMarket'
      });

      const formattedInfo = {
        owner: marketInfo[0],
        collateralAsset: marketInfo[1],
        feeCollectorNFT: marketInfo[2],
        callbackRecipient: marketInfo[3],
        marketParams: {
          feeRate: Number(marketInfo[4].feeRate),
          assertionLiveness: Number(marketInfo[4].assertionLiveness),
          bondAmount: marketInfo[4].bondAmount.toString(),
          bondCurrency: marketInfo[4].bondCurrency,
          uniswapPositionManager: marketInfo[4].uniswapPositionManager,
          uniswapSwapRouter: marketInfo[4].uniswapSwapRouter,
          uniswapQuoter: marketInfo[4].uniswapQuoter,
          optimisticOracleV3: marketInfo[4].optimisticOracleV3,
          claimStatement: marketInfo[4].claimStatement
        }
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(formattedInfo, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching market info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getEpochInfo = {
  name: "get_foil_period_info",
  description: "Gets detailed information about a specific period",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      epochId: {
        type: "string",
        description: "The ID of the period to get information about"
      }
    },
    required: ["marketAddress", "epochId"],
  },
  function: async (args: { marketAddress: string; epochId: string }) => {
    try {
      const epochInfo = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getEpoch',
        args: [BigInt(args.epochId)]
      });

      const formattedInfo = {
        epochData: {
          startTime: epochInfo[0].startTime.toString(),
          endTime: epochInfo[0].endTime.toString(),
          startingSqrtPriceX96: epochInfo[0].startingSqrtPriceX96.toString(),
          settled: epochInfo[0].settled,
          settlementPriceX96: epochInfo[0].settlementPriceX96.toString()
        },
        marketParams: {
          feeRate: Number(epochInfo[1].feeRate),
          assertionLiveness: Number(epochInfo[1].assertionLiveness),
          bondAmount: epochInfo[1].bondAmount.toString(),
          bondCurrency: epochInfo[1].bondCurrency,
          uniswapPositionManager: epochInfo[1].uniswapPositionManager,
          uniswapSwapRouter: epochInfo[1].uniswapSwapRouter,
          uniswapQuoter: epochInfo[1].uniswapQuoter,
          optimisticOracleV3: epochInfo[1].optimisticOracleV3,
          claimStatement: epochInfo[1].claimStatement
        }
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(formattedInfo, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching epoch info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getLatestEpochInfo = {
  name: "get_foil_latest_period_info",
  description: "Gets information about the most recent period",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      }
    },
    required: ["marketAddress"],
  },
  function: async (args: { marketAddress: string }) => {
    try {
      const epochInfo = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getLatestEpoch'
      });

      const formattedInfo = {
        epochData: {
          startTime: epochInfo[0].startTime.toString(),
          endTime: epochInfo[0].endTime.toString(),
          startingSqrtPriceX96: epochInfo[0].startingSqrtPriceX96.toString(),
          settled: epochInfo[0].settled,
          settlementPriceX96: epochInfo[0].settlementPriceX96.toString()
        },
        marketParams: {
          feeRate: Number(epochInfo[1].feeRate),
          assertionLiveness: Number(epochInfo[1].assertionLiveness),
          bondAmount: epochInfo[1].bondAmount.toString(),
          bondCurrency: epochInfo[1].bondCurrency,
          uniswapPositionManager: epochInfo[1].uniswapPositionManager,
          uniswapSwapRouter: epochInfo[1].uniswapSwapRouter,
          uniswapQuoter: epochInfo[1].uniswapQuoter,
          optimisticOracleV3: epochInfo[1].optimisticOracleV3,
          claimStatement: epochInfo[1].claimStatement
        }
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(formattedInfo, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching latest epoch info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getTokenOwner = {
  name: "get_foil_token_owner",
  description: "Gets the owner address of a specific position token",
  parameters: {
    properties: {
      tokenId: {
        type: "string",
        description: "The ID of the position token"
      }
    },
    required: ["tokenId"],
  },
  function: async (args: { tokenId: string }) => {
    try {
      const owner = await client.readContract({
        address: args.tokenId as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'ownerOf',
        args: [BigInt(args.tokenId)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ owner }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching token owner: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getTokenByIndex = {
  name: "get_foil_token_by_index",
  description: "Gets a position token ID by its index",
  parameters: {
    properties: {
      index: {
        type: "string",
        description: "The index of the token to get"
      }
    },
    required: ["index"],
  },
  function: async (args: { index: string }) => {
    try {
      const tokenId = await client.readContract({
        address: args.index as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'tokenByIndex',
        args: [BigInt(args.index)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ tokenId: tokenId.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching token by index: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getReferencePrice = {
  name: "get_foil_reference_price",
  description: "Gets the reference price for a market",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to get the reference price for"
      }
    },
    required: ["marketAddress"],
  },
  function: async (args: { marketAddress: string }) => {
    try {
      const referencePrice = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getReferencePrice'
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ referencePrice: referencePrice.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching reference price: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getPosition = {
  name: "get_foil_position",
  description: "Gets detailed information about a specific position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get information about"
      }
    },
    required: ["marketAddress", "positionId"],
  },
  function: async (args: { marketAddress: string; positionId: string }) => {
    try {
      const position = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPosition',
        args: [BigInt(args.positionId)]
      }) as PositionData;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            id: position.id.toString(),
            kind: position.kind,
            epochId: position.epochId.toString(),
            depositedCollateralAmount: position.depositedCollateralAmount.toString(),
            borrowedVEth: position.borrowedVEth.toString(),
            borrowedVGas: position.borrowedVGas.toString(),
            vEthAmount: position.vEthAmount.toString(),
            vGasAmount: position.vGasAmount.toString(),
            uniswapPositionId: position.uniswapPositionId.toString(),
            isSettled: position.isSettled
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching position: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getPositionCollateralValue = {
  name: "get_foil_position_collateral_value",
  description: "Gets the collateral value of a specific position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get collateral value for"
      }
    },
    required: ["marketAddress", "positionId"],
  },
  function: async (args: { marketAddress: string; positionId: string }) => {
    try {
      const collateralValue = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionCollateralValue',
        args: [BigInt(args.positionId)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ collateralValue: collateralValue.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching position collateral value: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getPositionPnl = {
  name: "get_foil_position_pnl",
  description: "Gets the profit and loss (PnL) of a specific position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get PnL for"
      }
    },
    required: ["marketAddress", "positionId"],
  },
  function: async (args: { marketAddress: string; positionId: string }) => {
    try {
      const pnl = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionPnl',
        args: [BigInt(args.positionId)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ pnl: pnl.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching position PnL: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getPositionSize = {
  name: "get_foil_position_size",
  description: "Gets the size of a specific position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get size for"
      }
    },
    required: ["marketAddress", "positionId"],
  },
  function: async (args: { marketAddress: string; positionId: string }) => {
    try {
      const size = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionSize',
        args: [BigInt(args.positionId)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ size: size.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching position size: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getSqrtPriceX96 = {
  name: "get_foil_sqrt_price",
  description: "Gets the sqrt price for a specific period",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      epochId: {
        type: "string",
        description: "The ID of the period to get sqrt price for"
      }
    },
    required: ["marketAddress", "epochId"],
  },
  function: async (args: { marketAddress: string; epochId: string }) => {
    try {
      const sqrtPriceX96 = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getSqrtPriceX96',
        args: [BigInt(args.epochId)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ sqrtPriceX96: sqrtPriceX96.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching sqrt price: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getDecimalPriceFromSqrtPriceX96 = {
  name: "get_foil_decimal_price_from_sqrt_price",
  description: "Converts a sqrt price to a decimal price",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      sqrtPriceX96: {
        type: "string",
        description: "The sqrt price to convert"
      }
    },
    required: ["marketAddress", "sqrtPriceX96"],
  },
  function: async (args: { marketAddress: string; sqrtPriceX96: string }) => {
    try {
      const decimalPrice = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getDecimalPriceFromSqrtPriceX96',
        args: [BigInt(args.sqrtPriceX96)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ decimalPrice: decimalPrice.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error converting sqrt price to decimal: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getMarketTickSpacing = {
  name: "get_foil_market_tick_spacing",
  description: "Gets the tick spacing for a market",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      }
    },
    required: ["marketAddress"],
  },
  function: async (args: { marketAddress: string }) => {
    try {
      const tickSpacing = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getMarketTickSpacing'
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ tickSpacing: tickSpacing.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching market tick spacing: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getTotalSupply = {
  name: "get_foil_total_supply",
  description: "Gets the total supply of Foil tokens",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      }
    },
    required: ["marketAddress"],
  },
  function: async (args: { marketAddress: string }) => {
    try {
      const totalSupply = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'totalSupply'
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ totalSupply: totalSupply.toString() }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching total supply: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getBalanceOf = {
  name: "get_foil_balance_of",
  description: "Gets the balance of Foil tokens for a specific holder",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      holder: {
        type: "string",
        description: "The address to query balance for"
      }
    },
    required: ["marketAddress", "holder"],
  },
  function: async (args: { marketAddress: string; holder: string }) => {
    try {
      const balance = await client.readContract({
        address: args.marketAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'balanceOf',
        args: [args.holder as `0x${string}`]
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
          text: `Error fetching balance: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
}; 