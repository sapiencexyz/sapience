// MCP Tool for IFoilStructs
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Process ABI and handle struct types
const parsedABI = abiJson.map(item => {
  // Convert struct types to tuples
  if (item.type === 'function') {
    item.inputs = item.inputs.map((input: any) => {
      if (input.internalType?.startsWith('struct ')) {
        return { ...input, type: 'tuple' };
      }
      return input;
    });
    item.outputs = item.outputs.map((output: any) => {
      if (output.internalType?.startsWith('struct ')) {
        return { ...output, type: 'tuple' };
      }
      return output;
    });
  }
  return item;
}).filter(item => item.type === 'function');

// TypeScript types for structs
export type IFoilStructsStructs = {
  LiquidityMintParams: {
    epochId: bigint;
    amountTokenA: bigint;
    amountTokenB: bigint;
    collateralAmount: bigint;
    lowerTick: bigint;
    upperTick: bigint;
    minAmountTokenA: bigint;
    minAmountTokenB: bigint;
    deadline: bigint;
  };
  LiquidityDecreaseParams: {
    positionId: bigint;
    liquidity: bigint;
    minGasAmount: bigint;
    minEthAmount: bigint;
    deadline: bigint;
  };
  LiquidityIncreaseParams: {
    positionId: bigint;
    collateralAmount: bigint;
    gasTokenAmount: bigint;
    ethTokenAmount: bigint;
    minGasAmount: bigint;
    minEthAmount: bigint;
    deadline: bigint;
  };
  MarketParams: {
    feeRate: bigint;
    assertionLiveness: bigint;
    bondAmount: bigint;
    bondCurrency: string;
    uniswapPositionManager: string;
    uniswapSwapRouter: string;
    uniswapQuoter: string;
    optimisticOracleV3: string;
    claimStatement: string;
  };
  EpochData: {
    epochId: bigint;
    startTime: bigint;
    endTime: bigint;
    pool: string;
    ethToken: string;
    gasToken: string;
    minPriceD18: bigint;
    maxPriceD18: bigint;
    baseAssetMinPriceTick: bigint;
    baseAssetMaxPriceTick: bigint;
    settled: boolean;
    settlementPriceD18: bigint;
    assertionId: string;
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
export const IFoilStructsTools = {
};
