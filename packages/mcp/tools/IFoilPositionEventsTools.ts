// MCP Tool for IFoilPositionEvents
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

// TypeScript types for structs
export type IFoilPositionEventsStructs = {
  LiquidityPositionCreatedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    liquidity: bigint;
    addedAmount0: bigint;
    addedAmount1: bigint;
    lowerTick: bigint;
    upperTick: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
  LiquidityPositionDecreasedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    requiredCollateralAmount: bigint;
    liquidity: bigint;
    decreasedAmount0: bigint;
    decreasedAmount1: bigint;
    loanAmount0: bigint;
    loanAmount1: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
  LiquidityPositionIncreasedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    requiredCollateralAmount: bigint;
    liquidity: bigint;
    increasedAmount0: bigint;
    increasedAmount1: bigint;
    loanAmount0: bigint;
    loanAmount1: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
  LiquidityPositionClosedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    positionKind: any;
    collectedAmount0: bigint;
    collectedAmount1: bigint;
    loanAmount0: bigint;
    loanAmount1: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
  TraderPositionModifiedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    requiredCollateral: bigint;
    initialPrice: bigint;
    finalPrice: bigint;
    tradeRatio: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
  TraderPositionCreatedEventData: {
    sender: string;
    epochId: bigint;
    positionId: bigint;
    requiredCollateral: bigint;
    initialPrice: bigint;
    finalPrice: bigint;
    tradeRatio: bigint;
    positionCollateralAmount: bigint;
    positionVethAmount: bigint;
    positionVgasAmount: bigint;
    positionBorrowedVeth: bigint;
    positionBorrowedVgas: bigint;
    deltaCollateral: bigint;
  };
};

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
export const IFoilPositionEventsTools = {
};
