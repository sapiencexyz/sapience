import { PublicClient } from 'viem';

export const calculateOpenPositionValue = async (
  positionId: number,
  marketAddress: string,
  client: PublicClient
): Promise<bigint> => {
  const collateralValue = await client.readContract({
    address: marketAddress as `0x${string}`,
    abi: [
      {
        type: 'function',
        name: 'getPositionCollateralValue',
        inputs: [
          {
            name: 'positionId',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
        outputs: [
          {
            name: 'collateralValue',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
        stateMutability: 'view',
      },
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'positionId',
            type: 'uint256',
          },
        ],
        type: 'error',
        name: 'InvalidPositionId',
      },
    ],
    functionName: 'getPositionCollateralValue',
    args: [BigInt(positionId)],
  });

  return collateralValue;
};

export const calculateOpenPositionPnL = async (
  positionId: number,
  marketAddress: string,
  client: PublicClient
): Promise<bigint> => {
  const pnl = await client.readContract({
    address: marketAddress as `0x${string}`,
    abi: [
      {
        type: 'function',
        name: 'getPositionPnl',
        inputs: [
          {
            name: 'positionId',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
        outputs: [
          {
            name: 'pnl',
            type: 'int256',
            internalType: 'int256',
          },
        ],
        stateMutability: 'view',
      },
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'positionId',
            type: 'uint256',
          },
        ],
        type: 'error',
        name: 'InvalidPositionId',
      },
    ],
    functionName: 'getPositionPnl',
    args: [BigInt(positionId)],
  });

  return pnl as bigint;
};
