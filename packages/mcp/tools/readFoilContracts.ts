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

const getMarketInfo = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
    },
    required: ['address'],
  },
  function: async ({ address }: { address: string }) => {
    try {
      const marketInfo = await client.readContract({
        address: address as `0x${string}`,
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

const getEpochInfo = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The period ID to query',
      },
    },
    required: ['address', 'epochId'],
  },
  function: async ({ address, epochId }: { address: string; epochId: string }) => {
    try {
      const epochInfo = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getEpoch',
        args: [BigInt(epochId)]
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

const getLatestEpochInfo = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
    },
    required: ['address'],
  },
  function: async ({ address }: { address: string }) => {
    try {
      const epochInfo = await client.readContract({
        address: address as `0x${string}`,
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

const getTokenOwner = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      tokenId: {
        type: 'string',
        description: 'The position ID to query',
      },
    },
    required: ['address', 'tokenId'],
  },
  function: async ({ address, tokenId }: { address: string; tokenId: string }) => {
    try {
      const owner = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)]
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

const getTokenByIndex = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      index: {
        type: 'string',
        description: 'The index to query',
      },
    },
    required: ['address', 'index'],
  },
  function: async ({ address, index }: { address: string; index: string }) => {
    try {
      const tokenId = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'tokenByIndex',
        args: [BigInt(index)]
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

const getReferencePrice = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
    },
    required: ['address'],
  },
  function: async ({ address }: { address: string }) => {
    try {
      const referencePrice = await client.readContract({
        address: address as `0x${string}`,
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

const getPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID to query',
      },
    },
    required: ['address', 'positionId'],
  },
  function: async ({ address, positionId }: { address: string; positionId: string }) => {
    try {
      const position = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPosition',
        args: [BigInt(positionId)]
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

const getPositionCollateralValue = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID to query',
      },
    },
    required: ['address', 'positionId'],
  },
  function: async ({ address, positionId }: { address: string; positionId: string }) => {
    try {
      const collateralValue = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionCollateralValue',
        args: [BigInt(positionId)]
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

const getPositionPnl = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID to query',
      },
    },
    required: ['address', 'positionId'],
  },
  function: async ({ address, positionId }: { address: string; positionId: string }) => {
    try {
      const pnl = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionPnl',
        args: [BigInt(positionId)]
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

const getPositionSize = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID to query',
      },
    },
    required: ['address', 'positionId'],
  },
  function: async ({ address, positionId }: { address: string; positionId: string }) => {
    try {
      const size = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getPositionSize',
        args: [BigInt(positionId)]
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

const getSqrtPriceX96 = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The epoch ID to query',
      },
    },
    required: ['address', 'epochId'],
  },
  function: async ({ address, epochId }: { address: string; epochId: string }) => {
    try {
      const sqrtPriceX96 = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getSqrtPriceX96',
        args: [BigInt(epochId)]
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

const getDecimalPriceFromSqrtPriceX96 = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      sqrtPriceX96: {
        type: 'string',
        description: 'The sqrt price to convert',
      },
    },
    required: ['address', 'sqrtPriceX96'],
  },
  function: async ({ address, sqrtPriceX96 }: { address: string; sqrtPriceX96: string }) => {
    try {
      const decimalPrice = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'getDecimalPriceFromSqrtPriceX96',
        args: [BigInt(sqrtPriceX96)]
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

const getMarketTickSpacing = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
    },
    required: ['address'],
  },
  function: async ({ address }: { address: string }) => {
    try {
      const tickSpacing = await client.readContract({
        address: address as `0x${string}`,
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

const getTotalSupply = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
    },
    required: ['address'],
  },
  function: async ({ address }: { address: string }) => {
    try {
      const totalSupply = await client.readContract({
        address: address as `0x${string}`,
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

const getBalanceOf = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      holder: {
        type: 'string',
        description: 'The address to query balance for',
      },
    },
    required: ['address', 'holder'],
  },
  function: async ({ address, holder }: { address: string; holder: string }) => {
    try {
      const balance = await client.readContract({
        address: address as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'balanceOf',
        args: [holder as `0x${string}`]
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

export {
  getMarketInfo,
  getEpochInfo,
  getLatestEpochInfo,
  getTokenOwner,
  getTokenByIndex,
  getReferencePrice,
  getPosition,
  getPositionCollateralValue,
  getPositionPnl,
  getPositionSize,
  getSqrtPriceX96,
  getDecimalPriceFromSqrtPriceX96,
  getMarketTickSpacing,
  getTotalSupply,
  getBalanceOf
}; 