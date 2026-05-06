import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { etherealTestnetChain, etherealChain } from '../lib/utils';
import { computeSmartAccountAddress } from '@sapience/sdk/session';

import { createLogger } from '../core/logger';

const log = createLogger('services.sponsorship');

// OnboardingSponsor ABI — only the functions we need
const SPONSOR_ABI = [
  {
    type: 'function',
    name: 'setBudget',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'allocated', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'remainingBudget',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Default sponsorship budget per new user (in collateral token units).
 * 18 decimals — e.g. 10 USDe = 10_000000000000000000
 */
const DEFAULT_BUDGET = parseUnits('1', 18);

function getChainForId(chainId: number) {
  switch (chainId) {
    case 5064014:
      return etherealChain;
    case 13374202:
      return etherealTestnetChain;
    default:
      throw new Error(`Unsupported chain ${chainId} for sponsorship`);
  }
}

interface SponsorshipConfig {
  /** Private key for the budget manager account (hex, with 0x prefix) */
  budgetManagerPrivateKey: `0x${string}`;
  /** OnboardingSponsor contract address */
  sponsorAddress: Address;
  /** Chain ID */
  chainId: number;
  /** Budget per user in wei (defaults to DEFAULT_BUDGET) */
  budgetPerUser?: bigint;
}

function getConfig(): SponsorshipConfig | null {
  const key = process.env.BUDGET_MANAGER_PRIVATE_KEY;
  const address = process.env.ONBOARDING_SPONSOR_ADDRESS;
  const chainId = parseInt(process.env.CHAIN_ID || '13374202', 10);

  if (!key || !address) {
    return null;
  }

  const budgetStr = process.env.SPONSOR_BUDGET_PER_USER;

  return {
    budgetManagerPrivateKey: key as `0x${string}`,
    sponsorAddress: address as Address,
    chainId,
    budgetPerUser: budgetStr ? BigInt(budgetStr) : DEFAULT_BUDGET,
  };
}

let walletClient: WalletClient | null = null;
let publicClient: PublicClient | null = null;

function getClients(config: SponsorshipConfig) {
  if (!walletClient) {
    const chain = getChainForId(config.chainId);
    const account = privateKeyToAccount(config.budgetManagerPrivateKey);
    const rpcUrl =
      process.env[`CHAIN_${config.chainId}_RPC_URL`] ||
      chain.rpcUrls.default.http[0];

    walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }
  return { walletClient: walletClient!, publicClient: publicClient! };
}

/**
 * Grant a sponsorship budget to a user on the OnboardingSponsor contract.
 * Called when a user successfully claims an invite code.
 *
 * @returns transaction hash, or null if sponsorship is not configured
 */
export async function grantSponsorshipBudget(
  beneficiary: Address
): Promise<string | null> {
  const config = getConfig();
  if (!config) {
    log.info(
      '[sponsorship] Not configured (missing BUDGET_MANAGER_PRIVATE_KEY or ONBOARDING_SPONSOR_ADDRESS)'
    );
    return null;
  }

  const { walletClient, publicClient } = getClients(config);

  try {
    // Derive the smart account address from the EOA — the sponsor contract
    // tracks budgets by smart account address, not raw EOA.
    const smartAccount = computeSmartAccountAddress(beneficiary);
    log.info(
      `[sponsorship] Derived smart account ${smartAccount} for EOA ${beneficiary}`
    );

    // Check if user already has a budget
    const existing = (await publicClient.readContract({
      address: config.sponsorAddress,
      abi: SPONSOR_ABI,
      functionName: 'remainingBudget',
      args: [smartAccount],
    })) as bigint;

    if (existing > 0n) {
      log.info(
        `[sponsorship] ${smartAccount} (EOA ${beneficiary}) already has budget: ${existing}`
      );
      return null;
    }

    // Send setBudget transaction
    const chain = getChainForId(config.chainId);
    const account = privateKeyToAccount(config.budgetManagerPrivateKey);
    const hash = await walletClient.writeContract({
      address: config.sponsorAddress,
      abi: SPONSOR_ABI,
      functionName: 'setBudget',
      args: [smartAccount, config.budgetPerUser!],
      chain,
      account,
    });

    log.info(
      `[sponsorship] setBudget tx sent for ${smartAccount} (EOA ${beneficiary}): ${hash}`
    );

    // Wait for confirmation (fire-and-forget style — don't block the claim response)
    publicClient
      .waitForTransactionReceipt({ hash })
      .then((receipt) => {
        log.info(
          `[sponsorship] setBudget confirmed for ${smartAccount} (EOA ${beneficiary}) in block ${receipt.blockNumber}`
        );
      })
      .catch((err) => {
        log.error(
          {
            err,
            tags: { service: 'sponsorship' },
            beneficiary,
            smartAccount,
            hash,
          },
          '[sponsorship] setBudget confirmation failed'
        );
      });

    return hash;
  } catch (err) {
    log.error(
      {
        err,
        tags: { service: 'sponsorship' },
        beneficiary,
      },
      '[sponsorship] Failed to grant budget'
    );
    return null;
  }
}

/**
 * Check remaining sponsorship budget for a user.
 *
 * @returns remaining budget in wei, or null if not configured
 */
export async function getRemainingBudget(
  beneficiary: Address
): Promise<bigint | null> {
  const config = getConfig();
  if (!config) return null;

  const { publicClient } = getClients(config);

  // Derive the smart account address — the sponsor contract tracks
  // budgets by smart account address, not raw EOA.
  const smartAccount = computeSmartAccountAddress(beneficiary);

  try {
    const remaining = (await publicClient.readContract({
      address: config.sponsorAddress,
      abi: SPONSOR_ABI,
      functionName: 'remainingBudget',
      args: [smartAccount],
    })) as bigint;

    return remaining;
  } catch (err) {
    log.error(
      { err: err },
      `[sponsorship] Failed to read budget for ${smartAccount} (EOA ${beneficiary}):`
    );
    return null;
  }
}

/**
 * Check if sponsorship is configured and available.
 */
export function isSponsorshipEnabled(): boolean {
  return getConfig() !== null;
}

/**
 * Get the sponsor contract address (for frontend to use in MintRequest).
 */
export function getSponsorAddress(): Address | null {
  const config = getConfig();
  return config?.sponsorAddress ?? null;
}
