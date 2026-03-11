import { eas } from '@sapience/sdk/contracts/addresses';

export const getEASContractAddress = (chainId: number) => {
  const entry = eas[chainId as keyof typeof eas];
  if (!entry) {
    throw new Error(`EAS contract address not found for chainId: ${chainId}`);
  }
  return entry.address;
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
