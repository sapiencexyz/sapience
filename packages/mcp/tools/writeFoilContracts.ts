import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import FoilABI from '../Foil.json';

// Create a public client for interacting with the blockchain
const client = createPublicClient({
  chain: base,
  transport: http()
});

// Helper function to encode function data
function encodeFunction(functionName: string, args: any[]) {
  return encodeFunctionData({
    abi: FoilABI.abi,
    functionName,
    args
  });
}

const quoteCreateTraderPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The period ID',
      },
      collateral: {
        type: 'string',
        description: 'The collateral amount',
      },
      lowTick: {
        type: 'string',
        description: 'The lower tick bound',
      },
      highTick: {
        type: 'string',
        description: 'The upper tick bound',
      },
    },
    required: ['address', 'epochId', 'collateral', 'lowTick', 'highTick'],
  },
  function: async ({ address, epochId, collateral, lowTick, highTick }: { 
    address: string;
    epochId: string;
    collateral: string;
    lowTick: string;
    highTick: string;
  }) => {
    try {
      const calldata = encodeFunction('quoteCreateTraderPosition', [
        BigInt(epochId),
        BigInt(collateral),
        Number(lowTick),
        Number(highTick)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteCreateTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const createTraderPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The period ID',
      },
      collateral: {
        type: 'string',
        description: 'The collateral amount',
      },
      lowTick: {
        type: 'string',
        description: 'The lower tick bound',
      },
      highTick: {
        type: 'string',
        description: 'The upper tick bound',
      },
      baseTokenLimit: {
        type: 'string',
        description: 'Maximum base token to borrow',
      },
      quoteTokenLimit: {
        type: 'string',
        description: 'Maximum quote token to borrow',
      },
    },
    required: ['address', 'epochId', 'collateral', 'lowTick', 'highTick', 'baseTokenLimit', 'quoteTokenLimit'],
  },
  function: async ({ address, epochId, collateral, lowTick, highTick, baseTokenLimit, quoteTokenLimit }: { 
    address: string;
    epochId: string;
    collateral: string;
    lowTick: string;
    highTick: string;
    baseTokenLimit: string;
    quoteTokenLimit: string;
  }) => {
    try {
      const calldata = encodeFunction('createTraderPosition', [
        BigInt(epochId),
        BigInt(collateral),
        Number(lowTick),
        Number(highTick),
        BigInt(baseTokenLimit),
        BigInt(quoteTokenLimit)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const quoteModifyTraderPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID',
      },
      collateralDelta: {
        type: 'string',
        description: 'The change in collateral amount',
      },
    },
    required: ['address', 'positionId', 'collateralDelta'],
  },
  function: async ({ address, positionId, collateralDelta }: { 
    address: string;
    positionId: string;
    collateralDelta: string;
  }) => {
    try {
      const calldata = encodeFunction('quoteModifyTraderPosition', [
        BigInt(positionId),
        BigInt(collateralDelta)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteModifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const modifyTraderPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID',
      },
      collateralDelta: {
        type: 'string',
        description: 'The change in collateral amount',
      },
      baseTokenLimit: {
        type: 'string',
        description: 'Maximum base token delta',
      },
      quoteTokenLimit: {
        type: 'string',
        description: 'Maximum quote token delta',
      },
    },
    required: ['address', 'positionId', 'collateralDelta', 'baseTokenLimit', 'quoteTokenLimit'],
  },
  function: async ({ address, positionId, collateralDelta, baseTokenLimit, quoteTokenLimit }: { 
    address: string;
    positionId: string;
    collateralDelta: string;
    baseTokenLimit: string;
    quoteTokenLimit: string;
  }) => {
    try {
      const calldata = encodeFunction('modifyTraderPosition', [
        BigInt(positionId),
        BigInt(collateralDelta),
        BigInt(baseTokenLimit),
        BigInt(quoteTokenLimit)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const quoteLiquidityPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The period ID',
      },
      collateral: {
        type: 'string',
        description: 'The collateral amount',
      },
      lowTick: {
        type: 'string',
        description: 'The lower tick bound',
      },
      highTick: {
        type: 'string',
        description: 'The upper tick bound',
      },
    },
    required: ['address', 'epochId', 'collateral', 'lowTick', 'highTick'],
  },
  function: async ({ address, epochId, collateral, lowTick, highTick }: { 
    address: string;
    epochId: string;
    collateral: string;
    lowTick: string;
    highTick: string;
  }) => {
    try {
      const calldata = encodeFunction('quoteLiquidityPosition', [
        BigInt(epochId),
        BigInt(collateral),
        Number(lowTick),
        Number(highTick)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const createLiquidityPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      epochId: {
        type: 'string',
        description: 'The period ID',
      },
      collateral: {
        type: 'string',
        description: 'The collateral amount',
      },
      lowTick: {
        type: 'string',
        description: 'The lower tick bound',
      },
      highTick: {
        type: 'string',
        description: 'The upper tick bound',
      },
      baseTokenLimit: {
        type: 'string',
        description: 'Maximum base token to provide',
      },
      quoteTokenLimit: {
        type: 'string',
        description: 'Maximum quote token to provide',
      },
    },
    required: ['address', 'epochId', 'collateral', 'lowTick', 'highTick', 'baseTokenLimit', 'quoteTokenLimit'],
  },
  function: async ({ address, epochId, collateral, lowTick, highTick, baseTokenLimit, quoteTokenLimit }: { 
    address: string;
    epochId: string;
    collateral: string;
    lowTick: string;
    highTick: string;
    baseTokenLimit: string;
    quoteTokenLimit: string;
  }) => {
    try {
      const calldata = encodeFunction('createLiquidityPosition', [
        BigInt(epochId),
        BigInt(collateral),
        Number(lowTick),
        Number(highTick),
        BigInt(baseTokenLimit),
        BigInt(quoteTokenLimit)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding createLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const quoteModifyLiquidityPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID',
      },
      collateralDelta: {
        type: 'string',
        description: 'The change in collateral amount',
      },
    },
    required: ['address', 'positionId', 'collateralDelta'],
  },
  function: async ({ address, positionId, collateralDelta }: { 
    address: string;
    positionId: string;
    collateralDelta: string;
  }) => {
    try {
      const calldata = encodeFunction('quoteModifyLiquidityPosition', [
        BigInt(positionId),
        BigInt(collateralDelta)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteModifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

const modifyLiquidityPosition = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The Foil market contract address',
      },
      positionId: {
        type: 'string',
        description: 'The position ID',
      },
      collateralDelta: {
        type: 'string',
        description: 'The change in collateral amount',
      },
      baseTokenLimit: {
        type: 'string',
        description: 'Maximum base token delta',
      },
      quoteTokenLimit: {
        type: 'string',
        description: 'Maximum quote token delta',
      },
    },
    required: ['address', 'positionId', 'collateralDelta', 'baseTokenLimit', 'quoteTokenLimit'],
  },
  function: async ({ address, positionId, collateralDelta, baseTokenLimit, quoteTokenLimit }: { 
    address: string;
    positionId: string;
    collateralDelta: string;
    baseTokenLimit: string;
    quoteTokenLimit: string;
  }) => {
    try {
      const calldata = encodeFunction('modifyLiquidityPosition', [
        BigInt(positionId),
        BigInt(collateralDelta),
        BigInt(baseTokenLimit),
        BigInt(quoteTokenLimit)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: address,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding modifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export {
  quoteCreateTraderPosition,
  createTraderPosition,
  quoteModifyTraderPosition,
  modifyTraderPosition,
  quoteLiquidityPosition,
  createLiquidityPosition,
  quoteModifyLiquidityPosition,
  modifyLiquidityPosition
}; 