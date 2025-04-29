import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';import FoilABI from '@foil/protocol/deployments/Foil.json';

// Create a public client for interacting with the blockchain
const client = createPublicClient({
  chain: base,
  transport: process.env.TRANSPORT_URL ? http(process.env.TRANSPORT_URL) : http()
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
  name: "get_sapience_market_group_info",
  description: "Gets detailed information about a market group's configuration",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group to get information about"
      }
    },
    required: ["marketGroupAddress"],
  },
  function: async (args: { marketGroupAddress: string }) => {
    try {
      const marketGroupInfo = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getMarket'
      });

      const formattedInfo = {
        owner: marketGroupInfo[0],
        collateralAsset: marketGroupInfo[1],
        feeCollectorNFT: marketGroupInfo[2],
        callbackRecipient: marketGroupInfo[3],
        marketParams: {
          feeRate: Number(marketGroupInfo[4].feeRate),
          assertionLiveness: Number(marketGroupInfo[4].assertionLiveness),
          bondAmount: marketGroupInfo[4].bondAmount.toString(),
          bondCurrency: marketGroupInfo[4].bondCurrency,
          uniswapPositionManager: marketGroupInfo[4].uniswapPositionManager,
          uniswapSwapRouter: marketGroupInfo[4].uniswapSwapRouter,
          uniswapQuoter: marketGroupInfo[4].uniswapQuoter,
          optimisticOracleV3: marketGroupInfo[4].optimisticOracleV3,
          claimStatement: marketGroupInfo[4].claimStatement
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
          text: `Error fetching market group info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getMarketPeriodInfo = {
  name: "get_sapience_market_period_info",
  description: "Gets detailed information about a specific market period",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      marketPeriodId: {
        type: "string",
        description: "The ID of the market period to get information about"
      }
    },
    required: ["marketGroupAddress", "marketPeriodId"],
  },
  function: async (args: { marketGroupAddress: string; marketPeriodId: string }) => {
    try {
      const marketPeriodInfo = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getEpoch',
        args: [BigInt(args.marketPeriodId)]
      });

      // Handle the case where marketPeriodInfo might be undefined or null
      if (!marketPeriodInfo) {
        throw new Error('No market period info returned');
      }

      // Safely extract values with type checking
      const formattedInfo = {
        marketPeriodData: marketPeriodInfo[0] ? {
          startTime: marketPeriodInfo[0].startTime?.toString() || '0',
          endTime: marketPeriodInfo[0].endTime?.toString() || '0',
          startingSqrtPriceX96: marketPeriodInfo[0].startingSqrtPriceX96?.toString() || '0',
          settled: Boolean(marketPeriodInfo[0].settled),
          settlementPriceX96: marketPeriodInfo[0].settlementPriceX96?.toString() || '0'
        } : null,
        marketParams: marketPeriodInfo[1] ? {
          feeRate: Number(marketPeriodInfo[1].feeRate || 0),
          assertionLiveness: Number(marketPeriodInfo[1].assertionLiveness || 0),
          bondAmount: (marketPeriodInfo[1].bondAmount || 0).toString(),
          bondCurrency: marketPeriodInfo[1].bondCurrency || '',
          uniswapPositionManager: marketPeriodInfo[1].uniswapPositionManager || '',
          uniswapSwapRouter: marketPeriodInfo[1].uniswapSwapRouter || '',
          uniswapQuoter: marketPeriodInfo[1].uniswapQuoter || '',
          optimisticOracleV3: marketPeriodInfo[1].optimisticOracleV3 || '',
          claimStatement: marketPeriodInfo[1].claimStatement || ''
        } : null
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
          text: `Error fetching market period info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getLatestMarketPeriodInfo = {
  name: "get_sapience_latest_market_period_info",
  description: "Gets information about the most recent market period",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      }
    },
    required: ["marketGroupAddress"],
  },
  function: async (args: { marketGroupAddress: string }) => {
    try {
      const marketPeriodInfo = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getLatestEpoch'
      });

      // Handle the case where marketPeriodInfo might be undefined or null
      if (!marketPeriodInfo) {
        throw new Error('No market period info returned');
      }

      // Safely extract values with type checking
      const formattedInfo = {
        marketPeriodData: marketPeriodInfo[0] ? {
          startTime: marketPeriodInfo[0].startTime?.toString() || '0',
          endTime: marketPeriodInfo[0].endTime?.toString() || '0',
          startingSqrtPriceX96: marketPeriodInfo[0].startingSqrtPriceX96?.toString() || '0',
          settled: Boolean(marketPeriodInfo[0].settled),
          settlementPriceX96: marketPeriodInfo[0].settlementPriceX96?.toString() || '0'
        } : null,
        marketParams: marketPeriodInfo[1] ? {
          feeRate: Number(marketPeriodInfo[1].feeRate || 0),
          assertionLiveness: Number(marketPeriodInfo[1].assertionLiveness || 0),
          bondAmount: (marketPeriodInfo[1].bondAmount || 0).toString(),
          bondCurrency: marketPeriodInfo[1].bondCurrency || '',
          uniswapPositionManager: marketPeriodInfo[1].uniswapPositionManager || '',
          uniswapSwapRouter: marketPeriodInfo[1].uniswapSwapRouter || '',
          uniswapQuoter: marketPeriodInfo[1].uniswapQuoter || '',
          optimisticOracleV3: marketPeriodInfo[1].optimisticOracleV3 || '',
          claimStatement: marketPeriodInfo[1].claimStatement || ''
        } : null
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
          text: `Error fetching latest market period info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getTokenOwner = {
  name: "get_sapience_token_owner",
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
  name: "get_sapience_token_by_index",
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
  name: "get_sapience_market_group_market_period_reference_price",
  description: "Gets the reference price for a market group's market period",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group to get reference price for"
      },
      marketPeriodId: {
        type: "string",
        description: "The ID of the market period to get reference price for"
      }
    },
    required: ["marketGroupAddress", "marketPeriodId"],
  },
  function: async (args: { marketGroupAddress: string; marketPeriodId: string }) => {
    // Validate required parameters (and handle stringified args)
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
    if (!args.marketGroupAddress) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: marketGroupAddress is required"
        }],
        isError: true
      };
    }
    if (!args.marketPeriodId) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: marketPeriodId is required"
        }],
        isError: true
      };
    }

    try {
      const referencePrice = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getReferencePrice',
        args: [BigInt(args.marketPeriodId)]
      });

      const formattedReferencePrice = referencePrice.toString();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(formattedReferencePrice, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error fetching market group reference price: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getPosition = {
  name: "get_sapience_position",
  description: "Gets detailed information about a specific position",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get information about"
      }
    },
    required: ["marketGroupAddress", "positionId"],
  },
  function: async (args: { marketGroupAddress: string; positionId: string }) => {
    try {
      const position = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_market_group_position_collateral_value",
  description: "Gets the collateral value of a specific position",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get collateral value for"
      }
    },
    required: ["marketGroupAddress", "positionId"],
  },
  function: async (args: { marketGroupAddress: string; positionId: string }) => {
    try {
      const collateralValue = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_market_group_position_pnl",
  description: "Gets the profit and loss (PnL) of a specific position",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get PnL for"
      }
    },
    required: ["marketGroupAddress", "positionId"],
  },
  function: async (args: { marketGroupAddress: string; positionId: string }) => {
    try {
      const pnl = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_market_group_position_size",
  description: "Gets the size of a specific position",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to get size for"
      }
    },
    required: ["marketGroupAddress", "positionId"],
  },
  function: async (args: { marketGroupAddress: string; positionId: string }) => {
    try {
      const size = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_market_group_market_period_sqrt_price",
  description: "Gets the sqrt price for a specific market period",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      marketPeriodId: {
        type: "string",
        description: "The ID of the market period to get sqrt price for"
      }
    },
    required: ["marketGroupAddress", "marketPeriodId"],
  },
  function: async (args: { marketGroupAddress: string; marketPeriodId: string }) => {
    try {
      const sqrtPriceX96 = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getSqrtPriceX96',
        args: [BigInt(args.marketPeriodId)]
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
  name: "get_sapience_market_group_decimal_price_from_sqrt_price",
  description: "Converts a sqrt price to a decimal price",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      sqrtPriceX96: {
        type: "string",
        description: "The sqrt price to convert"
      }
    },
    required: ["marketGroupAddress", "sqrtPriceX96"],
  },
  function: async (args: { marketGroupAddress: string; sqrtPriceX96: string }) => {
    try {
      const decimalPrice = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_market_group_tick_spacing",
  description: "Gets the tick spacing for a market group",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      }
    },
    required: ["marketGroupAddress"],
  },
  function: async (args: { marketGroupAddress: string }) => {
    try {
      const tickSpacing = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
          text: `Error fetching market group tick spacing: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const getTotalSupply = {
  name: "get_sapience_total_supply",
  description: "Gets the total supply of Foil tokens",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      }
    },
    required: ["marketGroupAddress"],
  },
  function: async (args: { marketGroupAddress: string }) => {
    try {
      const totalSupply = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
  name: "get_sapience_balance_of",
  description: "Gets the balance of Foil tokens for a specific holder",
  parameters: {
    properties: {
      marketGroupAddress: {
        type: "string",
        description: "The address of the market group"
      },
      holder: {
        type: "string",
        description: "The address to query balance for"
      }
    },
    required: ["marketGroupAddress", "holder"],
  },
  function: async (args: { marketGroupAddress: string; holder: string }) => {
    try {
      const balance = await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
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
