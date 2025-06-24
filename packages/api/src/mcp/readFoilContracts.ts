import { basePublicClient } from '../utils/utils';
import FoilABI from '@sapience/protocol/deployments/Foil.json';
import type { Abi } from 'abitype';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';

const FOIL_ABI = FoilABI.abi as unknown as Abi;

const client = basePublicClient;

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

// interface MarketParams {
//   feeRate: bigint;
//   assertionLiveness: bigint;
//   bondAmount: bigint;
//   bondCurrency: `0x${string}`;
//   uniswapPositionManager: `0x${string}`;
//   uniswapSwapRouter: `0x${string}`;
//   uniswapQuoter: `0x${string}`;
//   optimisticOracleV3: `0x${string}`;
// }

// interface MarketGroupData {
//   owner: `0x${string}`;
//   collateralAsset: `0x${string}`;
//   feeCollectorNFT: `0x${string}`;
//   callbackRecipient: `0x${string}`;
//   marketParams: MarketParams;
// }

// interface MarketData {
//   id: bigint;
//   startTime: bigint;
//   endTime: bigint;
//   pool: `0x${string}`;
//   ethToken: `0x${string}`;
//   gasToken: `0x${string}`;
//   minPriceD18: bigint;
//   maxPriceD18: bigint;
//   baseAssetMinPriceTick: number;
//   baseAssetMaxPriceTick: number;
//   settled: boolean;
//   settlementPriceD18: bigint;
//   assertionId: `0x${string}`;
//   claimStatement: `0x${string}`;
// }

// interface RawEpochData {
//   epochId: bigint;
//   startTime: bigint;
//   endTime: bigint;
//   pool: `0x${string}`;
//   ethToken: `0x${string}`;
//   gasToken: `0x${string}`;
//   minPriceD18: bigint;
//   maxPriceD18: bigint;
//   baseAssetMinPriceTick: number;
//   baseAssetMaxPriceTick: number;
//   settled: boolean;
//   settlementPriceD18: bigint;
//   assertionId: `0x${string}`;
//   claimStatement: `0x${string}`;
// }

// interface MarketDetailsData {
//   marketData: MarketData | null;
//   marketGroupParams: MarketParams | null;
// }

// const formatMarketParams = (params: Partial<MarketParams>): MarketParams => {
//   return {
//     feeRate: params.feeRate!,
//     assertionLiveness: params.assertionLiveness!,
//     bondAmount: params.bondAmount!,
//     bondCurrency: params.bondCurrency!,
//     uniswapPositionManager: params.uniswapPositionManager!,
//     uniswapSwapRouter: params.uniswapSwapRouter!,
//     uniswapQuoter: params.uniswapQuoter!,
//     optimisticOracleV3: params.optimisticOracleV3!,
//   };
// };

// export const getMarketGroupInfo = {
//   name: 'get_sapience_market_group_info',
//   description: "Gets detailed information about a market group's configuration",
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group to get information about'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const marketGroupInfo = (await client.readContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: FOIL_ABI,
//         functionName: 'getMarket',
//       })) as readonly [
//         `0x${string}`,
//         `0x${string}`,
//         `0x${string}`,
//         `0x${string}`,
//         MarketParams,
//       ];

//       const formattedInfo: MarketGroupData = {
//         owner: marketGroupInfo[0],
//         collateralAsset: marketGroupInfo[1],
//         feeCollectorNFT: marketGroupInfo[2],
//         callbackRecipient: marketGroupInfo[3],
//         marketParams: formatMarketParams(marketGroupInfo[4]),
//       };

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(formattedInfo, null, 2),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error fetching market group info: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

// export const getMarketDetails = {
//   name: 'get_sapience_market_details',
//   description: 'Gets detailed information about a specific market',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group'),
//       marketId: z
//         .string()
//         .describe('The ID of the market to get information about'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//     marketId: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const marketDetailsResult = (await client.readContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: FOIL_ABI,
//         functionName: 'getEpoch',
//         args: [BigInt(args.marketId)],
//       })) as readonly [RawEpochData, MarketParams];

//       if (!marketDetailsResult) {
//         throw new Error('No market details returned');
//       }

//       const formattedInfo: MarketDetailsData = {
//         marketData: marketDetailsResult[0]
//           ? {
//               id: marketDetailsResult[0].epochId,
//               startTime: marketDetailsResult[0].startTime,
//               endTime: marketDetailsResult[0].endTime,
//               pool: marketDetailsResult[0].pool,
//               ethToken: marketDetailsResult[0].ethToken,
//               gasToken: marketDetailsResult[0].gasToken,
//               minPriceD18: marketDetailsResult[0].minPriceD18,
//               maxPriceD18: marketDetailsResult[0].maxPriceD18,
//               baseAssetMinPriceTick:
//                 marketDetailsResult[0].baseAssetMinPriceTick,
//               baseAssetMaxPriceTick:
//                 marketDetailsResult[0].baseAssetMaxPriceTick,
//               settled: marketDetailsResult[0].settled,
//               settlementPriceD18: marketDetailsResult[0].settlementPriceD18,
//               assertionId: marketDetailsResult[0].assertionId,
//               claimStatement: marketDetailsResult[0].claimStatement,
//             }
//           : null,
//         marketGroupParams: marketDetailsResult[1]
//           ? formatMarketParams(marketDetailsResult[1])
//           : null,
//       };

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(formattedInfo, null, 2),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error fetching market details: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

// export const getLatestMarketDetails = {
//   name: 'get_sapience_latest_market_details',
//   description: 'Gets information about the most recent market',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const marketDetailsResult = (await client.readContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: FOIL_ABI,
//         functionName: 'getLatestEpoch',
//       })) as readonly [RawEpochData, MarketParams];

//       if (!marketDetailsResult) {
//         throw new Error('No market details returned');
//       }

//       const formattedInfo: MarketDetailsData = {
//         marketData: marketDetailsResult[0]
//           ? {
//               id: marketDetailsResult[0].epochId,
//               startTime: marketDetailsResult[0].startTime,
//               endTime: marketDetailsResult[0].endTime,
//               pool: marketDetailsResult[0].pool,
//               ethToken: marketDetailsResult[0].ethToken,
//               gasToken: marketDetailsResult[0].gasToken,
//               minPriceD18: marketDetailsResult[0].minPriceD18,
//               maxPriceD18: marketDetailsResult[0].maxPriceD18,
//               baseAssetMinPriceTick:
//                 marketDetailsResult[0].baseAssetMinPriceTick,
//               baseAssetMaxPriceTick:
//                 marketDetailsResult[0].baseAssetMaxPriceTick,
//               settled: marketDetailsResult[0].settled,
//               settlementPriceD18: marketDetailsResult[0].settlementPriceD18,
//               assertionId: marketDetailsResult[0].assertionId,
//               claimStatement: marketDetailsResult[0].claimStatement,
//             }
//           : null,
//         marketGroupParams: marketDetailsResult[1]
//           ? formatMarketParams(marketDetailsResult[1])
//           : null,
//       };

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(formattedInfo, null, 2),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error fetching latest market details: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

export const getTokenOwner = {
  name: 'get_sapience_token_owner',
  description: 'Gets the owner address of a specific position token',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      tokenId: z.string().describe('The ID of the position token'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    tokenId: string;
  }): Promise<CallToolResult> => {
    try {
      const owner = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'ownerOf',
        args: [BigInt(args.tokenId)],
      })) as `0x${string}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ owner }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching token owner: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getTokenByIndex = {
  name: 'get_sapience_token_by_index',
  description: 'Gets a position token ID by its index',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      index: z.string().describe('The index of the token to get'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    index: string;
  }): Promise<CallToolResult> => {
    try {
      const tokenId = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'tokenByIndex',
        args: [BigInt(args.index)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ tokenId: tokenId.toString() }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching token by index: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getMarketReferencePrice = {
  name: 'get_sapience_market_reference_price',
  description: 'Gets the reference price for a market',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      marketId: z
        .string()
        .describe('The ID of the market to get the reference price for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
  }): Promise<CallToolResult> => {
    try {
      const referencePrice = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getReferencePrice',
        args: [BigInt(args.marketId)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { referencePrice: referencePrice.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching reference price: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getPosition = {
  name: 'get_sapience_position',
  description: 'Gets detailed information about a specific position',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z
        .string()
        .describe('The ID of the position to get information about'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }): Promise<CallToolResult> => {
    try {
      const position = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getPosition',
        args: [BigInt(args.positionId)],
      })) as PositionData;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: position.id.toString(),
                kind: position.kind,
                marketId: position.epochId.toString(),
                depositedCollateralAmount:
                  position.depositedCollateralAmount.toString(),
                borrowedVEth: position.borrowedVEth.toString(),
                borrowedVGas: position.borrowedVGas.toString(),
                vEthAmount: position.vEthAmount.toString(),
                vGasAmount: position.vGasAmount.toString(),
                uniswapPositionId: position.uniswapPositionId.toString(),
                isSettled: position.isSettled,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching position: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getPositionCollateralValue = {
  name: 'get_sapience_position_collateral_value',
  description: 'Gets the collateral value of a specific position',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z
        .string()
        .describe('The ID of the position to get collateral value for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }): Promise<CallToolResult> => {
    try {
      const collateralValue = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getPositionCollateralValue',
        args: [BigInt(args.positionId)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { collateralValue: collateralValue.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching position collateral value: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getPositionPnl = {
  name: 'get_sapience_position_pnl',
  description: 'Gets the profit and loss (PnL) of a specific position',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to get PnL for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }): Promise<CallToolResult> => {
    try {
      const pnl = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getPositionPnl',
        args: [BigInt(args.positionId)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ pnl: pnl.toString() }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching position PnL: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getPositionSize = {
  name: 'get_sapience_position_size',
  description: 'Gets the size of a specific position',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to get size for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }): Promise<CallToolResult> => {
    try {
      const size = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getPositionSize',
        args: [BigInt(args.positionId)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ size: size.toString() }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching position size: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getMarketSqrtPrice = {
  name: 'get_sapience_market_sqrt_price',
  description: 'Gets the sqrt price for a specific market',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      marketId: z
        .string()
        .describe('The ID of the market to get sqrt price for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
  }): Promise<CallToolResult> => {
    try {
      const sqrtPriceX96 = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getSqrtPriceX96',
        args: [BigInt(args.marketId)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { sqrtPriceX96: sqrtPriceX96.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching sqrt price: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getDecimalPriceFromSqrtPriceX96 = {
  name: 'get_sapience_decimal_price_from_sqrt_price',
  description: 'Converts a sqrt price to a decimal price',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      sqrtPriceX96: z.string().describe('The sqrt price to convert'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    sqrtPriceX96: string;
  }): Promise<CallToolResult> => {
    try {
      const decimalPrice = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getDecimalPriceFromSqrtPriceX96',
        args: [BigInt(args.sqrtPriceX96)],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { decimalPrice: decimalPrice.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error converting sqrt price to decimal: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getMarketGroupTickSpacing = {
  name: 'get_sapience_market_group_tick_spacing',
  description: 'Gets the tick spacing for a market group',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
  }): Promise<CallToolResult> => {
    try {
      const tickSpacing = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'getMarketTickSpacing',
      })) as number;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { tickSpacing: tickSpacing.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching market group tick spacing: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getTotalSupply = {
  name: 'get_sapience_total_supply',
  description: 'Gets the total supply of Foil tokens',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
  }): Promise<CallToolResult> => {
    try {
      const totalSupply = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'totalSupply',
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { totalSupply: totalSupply.toString() },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching total supply: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getBalanceOf = {
  name: 'get_sapience_balance_of',
  description: 'Gets the balance of Foil tokens for a specific holder',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      holder: z.string().describe('The address to query balance for'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    holder: string;
  }): Promise<CallToolResult> => {
    try {
      const balance = (await client.readContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FOIL_ABI,
        functionName: 'balanceOf',
        args: [args.holder as `0x${string}`],
      })) as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ balance: balance.toString() }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};
