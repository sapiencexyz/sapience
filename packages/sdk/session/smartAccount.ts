import { createPublicClient, http, type Address } from 'viem';
import { createKernelAccount, addressToEmptyAccount } from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { getChainConfig, DEFAULT_CHAIN_ID } from '../constants/chain';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

// Cache for computed smart account addresses (keyed by owner+chainId)
const smartAccountCache = new Map<string, Address>();

/**
 * Compute the deterministic smart account address for a given owner EOA.
 * Uses ZeroDev Kernel V3.1 with ECDSA validator.
 * This is a pure computation (no on-chain state needed for counterfactual addresses).
 */
export async function computeSmartAccountAddress(ownerAddress: Address, chainId: number = DEFAULT_CHAIN_ID): Promise<Address> {
  const cacheKey = `${ownerAddress.toLowerCase()}-${chainId}`;
  const cached = smartAccountCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const chain = getChainConfig(chainId);
  const publicClient = createPublicClient({
    transport: http(chain.rpcUrls.default.http[0]),
    chain,
  });

  const emptyAccount = addressToEmptyAccount(ownerAddress);
  // Cast to any to avoid viem version mismatch type errors between ZeroDev and SDK
  const ecdsaValidator = await signerToEcdsaValidator(publicClient as any, {
    signer: emptyAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const account = await createKernelAccount(publicClient as any, {
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
