/**
 * Shared EIP-712 signature verifier (D-1).
 *
 * Extracted from the inline ECDSA + ERC-1271 verification paths that used
 * to live in `auction/escrowSigning.ts`. The consumer (`auction/escrowSigning`
 * legacy + the new `auction/committedIntentSigning`) passes the typed-data
 * structure plus the claimed signer address, and this helper walks through
 * the two supported branches per D-3:
 *
 *   1. **ECDSA** — recover the signer from the typed-data signature and
 *      compare against `expectedSigner`.
 *   2. **ERC-1271 fallback** — call `isValidSignature(digest, signature)` on
 *      the expected signer address (a smart account contract). Requires an
 *      RPC-enabled `publicClient`.
 *
 * A third, *optional* branch — off-chain smart-account derivation via
 * `computeSmartAccountAddress` — is available only for relayer convenience
 * (`smartAccountDerivationEnabled: true`). It is off by default because per
 * D-3 it was removed from the on-chain contracts.
 */

import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type PublicClient,
  type TypedData,
  type TypedDataDomain,
} from 'viem';
import { computeSmartAccountAddress } from './smartAccount';

// EIP-1271 magic return value: bytes4(keccak256("isValidSignature(bytes32,bytes)"))
const ERC1271_MAGIC_VALUE: Hex = '0x1626ba7e';

const ERC1271_ABI = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes4' }],
  },
] as const;

/** Typed-data payload accepted by the verifier. */
export interface Eip712TypedData {
  domain: TypedDataDomain;
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface VerifyEip712Options {
  /**
   * Optional viem `PublicClient`. Required to perform the ERC-1271 fallback
   * branch against a smart-account `expectedSigner`. If absent, only the
   * ECDSA (and optionally the off-chain derivation) branches run.
   */
  publicClient?: PublicClient;
  /**
   * If `true`, attempt the off-chain smart-account derivation branch
   * (`computeSmartAccountAddress(recovered) === expectedSigner`). Used by
   * the relayer path; off by default.
   */
  smartAccountDerivationEnabled?: boolean;
}

export interface VerifyEip712Result {
  valid: boolean;
  /** EOA address that produced the ECDSA signature, if recovery succeeded. */
  recoveredAddress?: Address;
  /** One of 'ecdsa' | 'erc1271' | 'smartAccountDerivation' when `valid` is true. */
  branch?: 'ecdsa' | 'erc1271' | 'smartAccountDerivation';
}

/**
 * Verify a typed-data EIP-712 signature against `expectedSigner`.
 *
 * Does NOT throw on failed branches — returns `{ valid: false }` with any
 * recovered address available. Callers can choose to log or retry.
 */
export async function verifyEip712Signature(
  typedData: Eip712TypedData,
  signature: Hex,
  expectedSigner: Address,
  options: VerifyEip712Options = {}
): Promise<VerifyEip712Result> {
  const expected = expectedSigner.toLowerCase();

  // Branch 1: ECDSA recovery
  let recoveredAddress: Address | undefined;
  try {
    recoveredAddress = (await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: typedData.message as any,
      signature,
    })) as Address;

    if (recoveredAddress.toLowerCase() === expected) {
      return { valid: true, recoveredAddress, branch: 'ecdsa' };
    }
  } catch (e) {
    console.debug('[eip712Verify] ECDSA recovery failed:', e);
  }

  // Branch 2: ERC-1271 fallback — only possible with an RPC client
  if (options.publicClient) {
    try {
      const digest = hashTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message: typedData.message as any,
      });

      const result = (await options.publicClient.readContract({
        address: expectedSigner,
        abi: ERC1271_ABI,
        functionName: 'isValidSignature',
        args: [digest, signature],
      })) as Hex;

      if (result?.toLowerCase() === ERC1271_MAGIC_VALUE) {
        return { valid: true, recoveredAddress, branch: 'erc1271' };
      }
    } catch (e) {
      // 1271 branch is best-effort — contract may not exist, may revert, etc.
      console.debug('[eip712Verify] ERC-1271 fallback failed:', e);
    }
  }

  // Optional branch 3: off-chain smart-account derivation (relayer only)
  if (options.smartAccountDerivationEnabled && recoveredAddress) {
    try {
      const derived = computeSmartAccountAddress(recoveredAddress);
      if (derived.toLowerCase() === expected) {
        return {
          valid: true,
          recoveredAddress,
          branch: 'smartAccountDerivation',
        };
      }
    } catch (e) {
      console.debug('[eip712Verify] smart-account derivation failed:', e);
    }
  }

  return { valid: false, recoveredAddress };
}
