import type { Address } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

interface UsePositionLiquidityProps {
  uniswapPositionId?: bigint | string;
  uniswapPositionManager?: Address;
  enabled?: boolean;
  chainId?: number;
}

export interface PositionData {
  nonce: bigint;
  operator: Address;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

export const usePositionLiquidity = ({
  uniswapPositionId,
  uniswapPositionManager,
  enabled = true,
  chainId,
}: UsePositionLiquidityProps) => {
  const { chainId: currentChainId } = useAccount();
  const effectiveChainId = chainId || currentChainId;

  const positionIdBigInt =
    typeof uniswapPositionId === 'string'
      ? BigInt(uniswapPositionId)
      : uniswapPositionId;

  const {
    data: rawPositionData,
    error,
    isLoading,
    isError,
    refetch,
  } = useReadContract({
    abi: [
      {
        inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
        name: 'positions',
        outputs: [
          { internalType: 'uint96', name: 'nonce', type: 'uint96' },
          { internalType: 'address', name: 'operator', type: 'address' },
          { internalType: 'address', name: 'token0', type: 'address' },
          { internalType: 'address', name: 'token1', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'int24', name: 'tickLower', type: 'int24' },
          { internalType: 'int24', name: 'tickUpper', type: 'int24' },
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          {
            internalType: 'uint256',
            name: 'feeGrowthInside0LastX128',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'feeGrowthInside1LastX128',
            type: 'uint256',
          },
          { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
          { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    address: uniswapPositionManager,
    functionName: 'positions',
    args: [positionIdBigInt || BigInt('0')],
    query: {
      enabled: Boolean(
        enabled &&
          uniswapPositionManager &&
          uniswapPositionManager !== '0x' &&
          uniswapPositionId
      ),
    },
    chainId: effectiveChainId,
  });

  const positionData: PositionData | undefined = rawPositionData
    ? {
        nonce: rawPositionData[0],
        operator: rawPositionData[1],
        token0: rawPositionData[2],
        token1: rawPositionData[3],
        fee: Number(rawPositionData[4]),
        tickLower: Number(rawPositionData[5]),
        tickUpper: Number(rawPositionData[6]),
        liquidity: rawPositionData[7],
        feeGrowthInside0LastX128: rawPositionData[8],
        feeGrowthInside1LastX128: rawPositionData[9],
        tokensOwed0: rawPositionData[10],
        tokensOwed1: rawPositionData[11],
      }
    : undefined;

  return {
    positionData,
    error,
    isLoading,
    isError,
    refetch,
  };
};
