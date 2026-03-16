import {
  concatHex,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';

// ---------------------------------------------------------------------------
// Hardcoded constants from ZeroDev SDK (Kernel v3.1)
// Verified against:
//   @zerodev/sdk/constants  → KernelVersionToAddressesMap["0.3.1"]
//   @zerodev/ecdsa-validator/constants → kernelVersionRangeToValidator[">=0.3.1"]
// ---------------------------------------------------------------------------

/** KernelFactory (CREATE2 deployer) for Kernel v3.1. */
export const FACTORY: Address = '0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419';

/** Bytecode hash of the Kernel v3.1 proxy used for CREATE2 address derivation. */
export const INIT_CODE_HASH: Hex =
  '0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6';

/** ZeroDev ECDSA validator address for Kernel >=0.3.1. */
export const ECDSA_VALIDATOR: Address =
  '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57';

/** VALIDATOR_TYPE.SECONDARY from @zerodev/sdk/constants. */
export const VALIDATOR_TYPE_SECONDARY: Hex = '0x01';

// ---------------------------------------------------------------------------
// ABI fragment — KernelV3.1 initialize
// Source: @zerodev/sdk/accounts/kernel/abi/kernel_v_3_1/KernelAccountAbi.ts
// ---------------------------------------------------------------------------

const KernelV3_1InitializeAbi = [
  {
    type: 'function',
    name: 'initialize',
    inputs: [
      { name: '_rootValidator', type: 'bytes21' },
      { name: 'hook', type: 'address' },
      { name: 'validatorData', type: 'bytes' },
      { name: 'hookData', type: 'bytes' },
      { name: 'initConfig', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * Compute the deterministic smart account address for a given owner EOA.
 * Uses ZeroDev Kernel V3.1 with ECDSA validator via pure CREATE2 — no RPC needed.
 *
 * Replicates the address derivation from `getKernelAddressFromECDSA` in
 * `@zerodev/ecdsa-validator` (with `initCodeHash` path) and
 * `generateSaltForV07` salt logic, but entirely synchronous.
 */
export function computeSmartAccountAddress(ownerAddress: Address): Address {
  // 1. rootValidator = VALIDATOR_TYPE.SECONDARY (1 byte) ++ ECDSA_VALIDATOR (20 bytes) = bytes21
  const rootValidator = concatHex([VALIDATOR_TYPE_SECONDARY, ECDSA_VALIDATOR]);

  // 2. Encode initialize(rootValidator, hook=0x0, validatorData=ownerAddress, hookData=0x, initConfig=[])
  const initData = encodeFunctionData({
    abi: KernelV3_1InitializeAbi,
    functionName: 'initialize',
    args: [rootValidator, zeroAddress, ownerAddress, '0x', []],
  });

  // 3. salt = keccak256(initData ++ index) where index = 0 (32 bytes)
  const salt = keccak256(concatHex([initData, toHex(0n, { size: 32 })]));

  // 4. CREATE2: address = last20(keccak256(0xff ++ factory ++ salt ++ initCodeHash))
  return getContractAddress({
    bytecodeHash: INIT_CODE_HASH,
    opcode: 'CREATE2',
    from: FACTORY,
    salt,
  });
}
