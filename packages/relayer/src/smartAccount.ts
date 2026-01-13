import { createPublicClient, http, type Address } from 'viem';
import { arbitrum } from 'viem/chains';
import { createKernelAccount, addressToEmptyAccount } from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

// Cache for computed smart account addresses
const smartAccountCache = new Map<string, Address>();

/**
 * Compute the deterministic smart account address for a given owner EOA.
 * Uses ZeroDev Kernel V3.1 with ECDSA validator.
 * This is a pure computation (no on-chain state needed for counterfactual addresses).
 */
export async function computeSmartAccountAddress(ownerAddress: Address): Promise<Address> {
  const cacheKey = ownerAddress.toLowerCase();
  const cached = smartAccountCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const publicClient = createPublicClient({
    transport: http(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    chain: arbitrum,
  });

  const emptyAccount = addressToEmptyAccount(ownerAddress);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: emptyAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const smartAccountAddress = account.address;
  smartAccountCache.set(cacheKey, smartAccountAddress);

  return smartAccountAddress;
}
