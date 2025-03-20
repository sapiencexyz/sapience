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
    ],
    functionName: 'getPositionCollateralValue',
    args: [BigInt(positionId)],
  });

  return collateralValue;
};
