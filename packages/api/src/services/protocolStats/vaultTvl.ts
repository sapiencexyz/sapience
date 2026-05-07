import { ContractFunctionExecutionError, erc20Abi } from 'viem';
import { getProviderForChain } from '../../lib/utils';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import prisma from '../../core/db';
import { resolveVaultAddress } from './vaultConfig';

/**
 * Fetch Vault balance: collateral.balanceOf(vault)
 */
export async function fetchVaultTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress as `0x${string}`],
  });

  return balance;
}

/**
 * Fetch vault collateral locked in the escrow: sum of counterpartyCollateral
 * for predictions that were active at `atTimestamp` (or currently active if omitted)
 * where the vault is the counterparty.
 *
 * Uses Picks.resolved / Picks.resolvedAt instead of Prediction.settled / settledAt
 * because losing predictions may never get settled on-chain.
 */
export async function fetchVaultDeployed(
  chainId: number = DEFAULT_CHAIN_ID,
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress,
      ...(atTimestamp
        ? {
            onChainCreatedAt: { lte: atTimestamp },
            OR: [
              // No pick config linked — treat as active
              { pickConfigId: null },
              // Pick config not yet resolved
              { pickConfiguration: { resolved: false } },
              // Pick config resolved after the queried timestamp
              {
                pickConfiguration: {
                  resolved: true,
                  resolvedAt: { gt: atTimestamp },
                },
              },
            ],
          }
        : {
            OR: [
              { pickConfigId: null },
              { pickConfiguration: { resolved: false } },
            ],
          }),
    },
    select: { counterpartyCollateral: true },
  });

  let total = 0n;
  for (const p of predictions) {
    total += BigInt(p.counterpartyCollateral);
  }
  return total;
}

/**
 * Fetch vault collateral locked in the escrow at a specific point in time.
 */
export async function fetchVaultDeployedAtBlock(
  chainId: number,
  _blockNumber: bigint,
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  return fetchVaultDeployed(chainId, atTimestamp, vaultAddressArg);
}

/**
 * Fetch Vault available assets: vault.availableAssets()
 */
export async function fetchVaultAvailableAssets(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Vault available assets at a specific block number.
 */
export async function fetchVaultAvailableAssetsAtBlock(
  chainId: number,
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
    blockNumber,
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Escrow TVL: collateral.balanceOf(predictionMarketEscrow)
 */
export async function fetchPredictionMarketEscrowTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  escrowAddressOverride?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress =
    escrowAddressOverride || contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress as `0x${string}`],
  });

  return balance;
}

/**
 * Fetch Vault balance at a specific block number (for historical queries).
 */
export async function fetchVaultTVLAtBlock(
  chainId: number,
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress as `0x${string}`],
    blockNumber,
  });

  return balance;
}

/**
 * Fetch Escrow TVL at a specific block number (for historical queries).
 */
export async function fetchPredictionMarketTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress = contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress],
    blockNumber,
  });

  return balance;
}

/**
 * Find the correct contract address for a given block number by checking
 * blockCreated timestamps. Returns the contract that was deployed at or before
 * the given block, preferring newer deployments.
 *
 * Order: current contract first, then legacy entries in array order.
 * Each entry's blockCreated indicates when it was deployed — if the target
 * block is before that, skip to the next (older) contract.
 */
export function getContractForBlock(
  contractConfig: (typeof contracts.predictionMarketVault)[number],
  blockNumber: bigint
): `0x${string}` | null {
  const currentBlock = contractConfig.blockCreated ?? 0;
  if (blockNumber >= BigInt(currentBlock)) {
    return contractConfig.address as `0x${string}`;
  }

  for (const legEntry of contractConfig.legacy ?? []) {
    const entry = normalizeLegacyEntry(legEntry);
    if (blockNumber >= BigInt(entry.blockCreated)) {
      return entry.address as `0x${string}`;
    }
  }

  return null;
}

/**
 * Sum the collateral balance across the current V2 escrow + every past V2 escrow
 * deployment. Iterates over the deduped list of [primary, ...legacies] from the
 * SDK config — avoids double-counting when `getContractForBlock` would return a
 * legacy (pre-redeploy blocks) and we'd otherwise re-read it from the legacy
 * loop. For blocks where a contract wasn't deployed yet, `balanceOf` returns 0
 * (the token's storage slot is simply empty for that address), so earlier
 * blocks just get a smaller total.
 *
 * `blockNumber` pins reads to a historical block; omit it (or pass `undefined`)
 * to read at chain head — used by the resolver's live-candle branch.
 */
export async function sumEscrowBalancesAtBlock(
  client: ReturnType<typeof getProviderForChain>,
  chainId: number,
  blockNumber?: bigint
): Promise<bigint> {
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;
  if (!escrowConfig || !collateralAddress) return 0n;

  const addrs = new Set<`0x${string}`>([escrowConfig.address as `0x${string}`]);
  for (const le of escrowConfig.legacy ?? []) {
    addrs.add(normalizeLegacyEntry(le).address as `0x${string}`);
  }

  // Reads are independent — fan out in parallel. Each per-address try/catch
  // ONLY swallows revert-like errors (balanceOf can revert when the contract
  // didn't exist at the queried block); network/timeout/rate-limit errors
  // (transport-level retries already exhausted) propagate so callers fail
  // loud rather than silently writing a "0 balance" snapshot.
  const balances = await Promise.all(
    [...addrs].map(async (addr) => {
      try {
        return await client.readContract({
          address: collateralAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [addr],
          ...(blockNumber !== undefined ? { blockNumber } : {}),
        });
      } catch (err) {
        if (err instanceof ContractFunctionExecutionError) return 0n;
        throw err;
      }
    })
  );
  return balances.reduce((acc, v) => acc + v, 0n);
}
