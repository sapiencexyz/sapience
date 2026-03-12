import { createPublicClient, http, type Address } from 'viem';
import { arbitrum } from 'viem/chains';
import { createKernelAccount, addressToEmptyAccount } from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

// Cache for computed smart account addresses (keyed by owner address only —
// the address is deterministic via CREATE2 and chain-independent).
const smartAccountCache = new Map<string, Address>();

// Arbitrum public client for address computation.
// The smart account address is chain-independent (same CREATE2 on every chain),
// but the ZeroDev SDK needs an eth_call to the EntryPoint's getSenderAddress,
// which requires the factory contracts to be deployed. Arbitrum is used because
// ZeroDev's canonical factory deployment is guaranteed there.
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL ?? 'https://arb1.arbitrum.io/rpc';

let _publicClient: ReturnType<typeof createPublicClient> | null = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      transport: http(ARBITRUM_RPC),
      chain: arbitrum,
    });
  }
  return _publicClient;
}

/**
 * Compute the deterministic smart account address for a given owner EOA.
 * Uses ZeroDev Kernel V3.1 with ECDSA validator.
 *
 * The address is chain-independent (CREATE2 gives the same result on every chain).
 * Requires one eth_call to the EntryPoint on Arbitrum.
 */
export async function computeSmartAccountAddress(ownerAddress: Address, _chainId?: number): Promise<Address> {
  const cacheKey = ownerAddress.toLowerCase();
  const cached = smartAccountCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const publicClient = getPublicClient();
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
