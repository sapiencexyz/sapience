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
