// Slimmed bingo-only port of app/src/lib/session/sessionKeyManager.ts.
// Single chain (Ethereal), single use case (PredictionMarketEscrow.mint).
// No Arbitrum, no Vault, no secondary-market trade approval, no Sentry.

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  slice,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  type KernelAccountClient,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import {
  toPermissionValidator,
  deserializePermissionAccount,
  serializePermissionAccount,
} from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import {
  toCallPolicy,
  toTimestampPolicy,
  toSignatureCallerPolicy,
  CallPolicyVersion,
  ParamCondition,
} from '@zerodev/permissions/policies';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import {
  predictionMarketEscrowAbi,
  collateralTokenAbi,
} from '@sapience/sdk/abis';
import {
  predictionMarketEscrow as escrowAddresses,
  collateralToken as collateralAddresses,
} from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL, etherealChain } from '@sapience/sdk/constants';

const PROJECT_ID =
  (import.meta.env.VITE_ZERODEV_PROJECT_ID as string | undefined) ??
  '88765cdf-f8a9-4b80-92e5-60ef51c94751';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;
export const CHAIN_ID = CHAIN_ID_ETHEREAL;
export const SESSION_STORAGE_KEY = 'sapience:bingo:session';

function getZeroDevUrl(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${PROJECT_ID}/chain/${chainId}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: etherealChain,
    transport: http(etherealChain.rpcUrls.default.http[0]),
  });
}

function getContractAddresses() {
  const wusde = collateralAddresses[CHAIN_ID]?.address;
  const escrow = escrowAddresses[CHAIN_ID]?.address;
  const isEscrowDeployed =
    escrow && escrow !== '0x0000000000000000000000000000000000000000';
  return {
    wusde,
    predictionMarketEscrow: isEscrowDeployed ? escrow : undefined,
  };
}

const WUSDE_DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

// ============================================================================
// Public types
// ============================================================================

export interface SessionConfig {
  durationHours: number;
  expiresAt: number;
  ownerAddress: Address;
  smartAccountAddress: Address;
}

export interface SerializedSession {
  config: SessionConfig;
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address;
  createdAt: number;
  etherealApproval: string;
  chainId: number;
}

export interface OwnerSigner {
  address: Address;
  provider: EIP1193Provider;
  switchChain: (chainId: number) => Promise<void>;
}

export interface SessionResult {
  config: SessionConfig;
  client: KernelAccountClient;
  serialized: SerializedSession;
}

export type SessionCreationStep =
  | 'switching-network'
  | 'requesting-approval'
  | 'deploying-account'
  | 'finalizing';

// ============================================================================
// createSession
// ============================================================================

export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number,
  onProgress?: (step: SessionCreationStep) => void,
): Promise<SessionResult> {
  const publicClient = getPublicClient();
  const contracts = getContractAddresses();
  if (!contracts.predictionMarketEscrow) {
    throw new Error('PredictionMarketEscrow is not deployed on Ethereal');
  }

  // 1. Generate session keypair
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  const expiresAt = Date.now() + durationHours * 3_600_000;
  const nowSec = Math.floor(Date.now() / 1000);
  const validUntilSec = nowSec + durationHours * 3600;

  // 2. Timestamp policy
  const timestampPolicy = toTimestampPolicy({
    validAfter: 0,
    validUntil: validUntilSec,
  });

  // 3. Call policy — only what bingo mint actually needs
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      // Auto-wrap native USDe to wUSDe if needed (up to 1M USDe)
      {
        target: contracts.wusde,
        abi: WUSDE_DEPOSIT_ABI,
        functionName: 'deposit',
        valueLimit: BigInt(1e24),
      },
      // Approve escrow to pull wUSDe collateral
      {
        target: contracts.wusde,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.ONE_OF,
            value: [contracts.predictionMarketEscrow] as Address[],
          },
          null,
        ],
      },
      // The actual mint
      {
        target: contracts.predictionMarketEscrow,
        abi: predictionMarketEscrowAbi,
        functionName: 'mint',
      },
    ],
  });

  // 4. Signature caller policy — escrow can call isValidSignature on the SA
  const signatureCallerPolicy = toSignatureCallerPolicy({
    allowedCallers: [contracts.predictionMarketEscrow] as Address[],
  });

  // 5. Switch chain if needed
  const currentChainHex = await ownerSigner.provider.request({
    method: 'eth_chainId',
  });
  const currentChainId = parseInt(currentChainHex, 16);
  if (currentChainId !== CHAIN_ID) {
    onProgress?.('switching-network');
    await ownerSigner.switchChain(CHAIN_ID);
  }

  // 6. Owner validator (sudo) for the kernel account
  const ownerValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner.provider,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // 7. Unique permission id so re-creating doesn't collide with prior installs
  const permissionId = slice(
    keccak256(
      `0x${sessionKeyAccount.address.slice(2)}${nowSec.toString(16).padStart(16, '0')}` as Hex,
    ),
    0,
    4,
  );

  // 8. Permission validator (the session key + its policies)
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint: ENTRY_POINT,
    signer: sessionKeySigner,
    policies: [callPolicy, timestampPolicy, signatureCallerPolicy],
    kernelVersion: KERNEL_VERSION,
    permissionId,
  });

  // 9. Kernel account combining sudo + permission
  const account = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: ownerValidator,
      regular: permissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const smartAccountAddress = account.address;

  // 10. Serialize — this triggers the EIP-712 enable signature in the owner's wallet
  onProgress?.('requesting-approval');
  const etherealApproval = await serializePermissionAccount(
    account,
    sessionPrivateKey,
  );

  // 11. Build client (bundler + paymaster)
  const client = createChainClient(etherealChain, account);

  // 12. Deploy the smart account if not yet on-chain (needed for ERC-1271)
  onProgress?.('deploying-account');
  const code = await publicClient.getCode({ address: smartAccountAddress });
  if (!code || code === '0x') {
    try {
      await client.sendUserOperation({
        callData: await account.encodeCalls([
          {
            to: contracts.wusde,
            data: encodeFunctionData({
              abi: collateralTokenAbi,
              functionName: 'approve',
              args: [contracts.predictionMarketEscrow, BigInt(0)],
            }),
            value: BigInt(0),
          },
        ]),
      });
    } catch (e) {
      console.warn('[Session] Smart account deploy UserOp failed:', e);
    }
  }

  onProgress?.('finalizing');

  const config: SessionConfig = {
    durationHours,
    expiresAt,
    ownerAddress: ownerSigner.address,
    smartAccountAddress,
  };

  const serialized: SerializedSession = {
    config,
    sessionPrivateKey,
    sessionKeyAddress: sessionKeyAccount.address,
    createdAt: Date.now(),
    etherealApproval,
    chainId: CHAIN_ID,
  };

  return { config, client, serialized };
}

// ============================================================================
// restoreSession
// ============================================================================

export async function restoreSession(
  serialized: SerializedSession,
): Promise<SessionResult> {
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }
  const publicClient = getPublicClient();

  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  const account = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner,
  );

  const client = createChainClient(etherealChain, account);

  // Deploy if still not on-chain
  const code = await publicClient.getCode({ address: account.address });
  if (!code || code === '0x') {
    const contracts = getContractAddresses();
    if (contracts.predictionMarketEscrow) {
      try {
        await client.sendUserOperation({
          callData: await account.encodeCalls([
            {
              to: contracts.wusde,
              data: encodeFunctionData({
                abi: collateralTokenAbi,
                functionName: 'approve',
                args: [contracts.predictionMarketEscrow, BigInt(0)],
              }),
              value: BigInt(0),
            },
          ]),
        });
      } catch (e) {
        console.warn('[Session] Restore-time deploy failed:', e);
      }
    }
  }

  return { config: serialized.config, client, serialized };
}

// ============================================================================
// Storage
// ============================================================================

export function saveSession(serialized: SerializedSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(serialized, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
}

export function loadSession(): SerializedSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SerializedSession;
    if (Date.now() > parsed.config.expiresAt) {
      clearSession();
      return null;
    }
    if (!parsed.etherealApproval) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

// ============================================================================
// prepareAccount — wrap native USDe + approve escrow up-front
// ============================================================================

/**
 * Wraps as much native USDe as needed for `tierAmountWei` and ensures the
 * smart account has at least `tierAmountWei` allowance to the escrow.
 * Both calls are batched into a single sponsored UserOp via the session key.
 *
 * Idempotent: skips wrap if the SA already has enough wUSDe, skips approve
 * if allowance ≥ tier. Returns `{ skipped: true }` if nothing was needed.
 */
export async function prepareAccount(
  client: KernelAccountClient,
  tierAmountWei: bigint,
  smartAccountAddress: Address,
): Promise<{ skipped: boolean; opHash?: Hex }> {
  const contracts = getContractAddresses();
  if (!contracts.predictionMarketEscrow) {
    throw new Error('Escrow not deployed');
  }

  const publicClient = getPublicClient();
  const nativeBalance = await publicClient.getBalance({
    address: smartAccountAddress,
  });
  const [wusdeBalance, allowance] = (await Promise.all([
    publicClient.readContract({
      address: contracts.wusde,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccountAddress],
    }),
    publicClient.readContract({
      address: contracts.wusde,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [smartAccountAddress, contracts.predictionMarketEscrow],
    }),
  ])) as [bigint, bigint];

  console.log('[prepareAccount] SA=' + smartAccountAddress);
  console.log(
    '[prepareAccount] tier=' +
      tierAmountWei +
      ' nativeUSDe=' +
      nativeBalance +
      ' wUSDe=' +
      wusdeBalance +
      ' allowance=' +
      allowance,
  );

  const calls: { to: Address; data: Hex; value: bigint }[] = [];

  if (wusdeBalance < tierAmountWei) {
    const amountToWrap = tierAmountWei - wusdeBalance;
    if (nativeBalance < amountToWrap) {
      throw new Error(
        `Not enough native USDe on smart account to wrap: have ${nativeBalance}, need ${amountToWrap}`,
      );
    }
    calls.push({
      to: contracts.wusde,
      data: encodeFunctionData({
        abi: WUSDE_DEPOSIT_ABI,
        functionName: 'deposit',
      }),
      value: amountToWrap,
    });
    console.log('[prepareAccount] will wrap ' + amountToWrap + ' native → wUSDe');
  }

  if (allowance < tierAmountWei) {
    calls.push({
      to: contracts.wusde,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [contracts.predictionMarketEscrow, tierAmountWei],
      }),
      value: 0n,
    });
    console.log(
      '[prepareAccount] will approve escrow=' +
        contracts.predictionMarketEscrow +
        ' amount=' +
        tierAmountWei,
    );
  }

  if (calls.length === 0) {
    console.log('[prepareAccount] nothing to do — skipping');
    return { skipped: true };
  }

  if (!client.account) throw new Error('Session client account missing');
  const opHash = await client.sendUserOperation({
    callData: await client.account.encodeCalls(calls),
  });
  console.log('[prepareAccount] UserOp sent hash=' + opHash);
  const receipt = await client.waitForUserOperationReceipt({ hash: opHash });
  if (!receipt.success) {
    const txHash = receipt.receipt?.transactionHash;
    const detail = receipt.reason
      ? `: ${receipt.reason}`
      : txHash
        ? ` (tx ${txHash})`
        : '';
    throw new Error(`Account prep reverted${detail}`);
  }
  console.log(
    '[prepareAccount] confirmed; tx=' + receipt.receipt?.transactionHash,
  );

  // Verify post-state so we know the approval really stuck before the mints fire.
  const allowanceAfter = (await publicClient.readContract({
    address: contracts.wusde,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [smartAccountAddress, contracts.predictionMarketEscrow],
  })) as bigint;
  console.log('[prepareAccount] post-state allowance=' + allowanceAfter);
  if (allowanceAfter < tierAmountWei) {
    throw new Error(
      `Allowance did not stick: expected ≥ ${tierAmountWei}, got ${allowanceAfter}`,
    );
  }

  return { skipped: false, opHash: opHash as Hex };
}

// ============================================================================
// Chain client (bundler + paymaster)
// ============================================================================

function createChainClient(
  chain: Chain,
  account: Awaited<ReturnType<typeof createKernelAccount>>,
): KernelAccountClient {
  const url = getZeroDevUrl(chain.id);
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(url),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(url),
    paymaster: {
      getPaymasterData: async (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });
}

