import type { Address } from 'viem';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import type { MarketGroupClassification } from '~/lib/types';
import { getPredictionValue } from '~/utils/getPredictionValue';

const EAS_CONTRACTS = {
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587', // Ethereum Mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
  10: '0x4200000000000000000000000000000000000021', // Optimism
  8453: '0x4200000000000000000000000000000000000021', // Base
  42161: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458', // Arbitrum
  432: '0x1ABeF822A38CC8906557cD73788ab23A607ae104', // Converge
} as const;

export const getEASContractAddress = (chainId: number) => {
  const address = EAS_CONTRACTS[chainId as keyof typeof EAS_CONTRACTS];
  if (!address) {
    throw new Error(`EAS contract address not found for chainId: ${chainId}`);
  }
  return address;
};

export const EAS_ATTEST_ABI = [
  {
    name: 'attest',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
];

export function encodeAttest({
  _marketAddress,
  _marketId,
  _comment,
  predictionAmount,
}: {
  _marketAddress: Address;
  _marketId: bigint;
  _comment: string;
  predictionAmount: bigint;
}) {
  return encodeAbiParameters(
    parseAbiParameters(
      'address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment'
    ),
    [
      _marketAddress,
      _marketId,
      `0x0000000000000000000000000000000000000000000000000000000000000000` as Address, // TODO: fix this, it is a stub!
      predictionAmount,
      _comment,
    ]
  );
}

export const encodeEASAttest = ({
  marketAddress,
  marketId,
  predictionInput,
  classification,
  comment,
}: {
  marketAddress: Address;
  marketId: string;
  predictionInput: string;
  classification: MarketGroupClassification;
  comment: string;
}) => {
  try {
    const finalPredictionBigInt = getPredictionValue(
      classification,
      predictionInput
    );

    return encodeAbiParameters(
      parseAbiParameters(
        'address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment'
      ),
      [
        marketAddress,
        BigInt(marketId),
        `0x0000000000000000000000000000000000000000000000000000000000000000` as Address, // TODO: fix this, it is a stub!
        finalPredictionBigInt,
        comment,
      ]
    );
  } catch (error) {
    console.error('Error encoding schema data:', error);
    if (
      error instanceof Error &&
      (error.message.includes('Numeric prediction input must be') ||
        error.message.includes('Unsupported market category'))
    ) {
      throw error;
    }
    throw new Error('Failed to encode prediction data');
  }
};
