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
  parseEventLogs,
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
import {
  CHAIN_ID_ETHEREAL_TESTNET,
  etherealTestnetChain,
} from '@sapience/sdk/constants';
import { BINGO_CARD_ABI, loadContractAddress } from '~/lib/bingoCard';

const PROJECT_ID =
  (import.meta.env.VITE_ZERODEV_PROJECT_ID as string | undefined) ??
  '88765cdf-f8a9-4b80-92e5-60ef51c94751';

const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;
export const CHAIN_ID = CHAIN_ID_ETHEREAL_TESTNET;
export const SESSION_STORAGE_KEY = 'sapience:bingo:session';

function getZeroDevUrl(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${PROJECT_ID}/chain/${chainId}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: etherealTestnetChain,
    transport: http(etherealTestnetChain.rpcUrls.default.http[0]),
  });
}

function getContractAddresses() {
  const wusde = collateralAddresses[CHAIN_ID]?.address;
  const escrow = escrowAddresses[CHAIN_ID]?.address;
  const isEscrowDeployed =
    escrow && escrow !== '0x0000000000000000000000000000000000000000';
  // BingoCard address is operator-configured (Settings gear → localStorage),
  // not a fixed SDK deployment, so it's resolved at session-creation time.
  const bingoCard = loadContractAddress() ?? undefined;
  return {
    wusde,
    predictionMarketEscrow: isEscrowDeployed ? escrow : undefined,
    bingoCard,
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
  if (!contracts.bingoCard) {
    throw new Error(
      'BingoCard address not set — configure it in Settings (gear icon) first',
    );
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

  // 3. Call policy — everything the bingo card flow needs, so a single
  //    session signature covers card mint, side declaration, line funding,
  //    and bonus claim without further wallet prompts.
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
      // Approve the escrow (counterparty path) or the BingoCard (card price)
      // to pull wUSDe collateral.
      {
        target: contracts.wusde,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.ONE_OF,
            value: [
              contracts.predictionMarketEscrow,
              contracts.bingoCard,
            ] as Address[],
          },
          null,
        ],
      },
      // Per-line escrow mint (sponsored by the BingoCard).
      {
        target: contracts.predictionMarketEscrow,
        abi: predictionMarketEscrowAbi,
        functionName: 'mint',
      },
      // Redeem a won line's predictor position for its payout.
      {
        target: contracts.predictionMarketEscrow,
        abi: predictionMarketEscrowAbi,
        functionName: 'redeem',
      },
      // Buy a card (payable: pays the Pyth entropy fee out of native USDe).
      {
        target: contracts.bingoCard,
        abi: BINGO_CARD_ABI,
        functionName: 'mintCard',
        valueLimit: BigInt(1e18),
      },
      // Declare YES/NO on the 16 cells.
      {
        target: contracts.bingoCard,
        abi: BINGO_CARD_ABI,
        functionName: 'setCellSides',
      },
      // Claim the bonus once all 10 lines are funded.
      {
        target: contracts.bingoCard,
        abi: BINGO_CARD_ABI,
        functionName: 'claimBonus',
      },
      // Sweep unused sponsor balance after a card expires.
      {
        target: contracts.bingoCard,
        abi: BINGO_CARD_ABI,
        functionName: 'withdrawUnused',
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
  const client = createChainClient(etherealTestnetChain, account);

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

  const client = createChainClient(etherealTestnetChain, account);

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
// prepareAccount — wrap native USDe + approve the BingoCard for the card price
// ============================================================================

/**
 * Wraps as much native USDe as needed for `cardPriceWei` and ensures the
 * smart account has at least `cardPriceWei` allowance to the BingoCard, which
 * pulls the card price at mint. Both calls are batched into a single sponsored
 * UserOp via the session key. Native USDe beyond the wrapped amount stays on
 * the account to cover the Pyth entropy fee on `mintCard`.
 *
 * Idempotent: skips wrap if the SA already has enough wUSDe, skips approve
 * if allowance ≥ price. Returns `{ skipped: true }` if nothing was needed.
 */
export async function prepareAccount(
  client: KernelAccountClient,
  cardPriceWei: bigint,
  smartAccountAddress: Address,
  entropyFeeWei: bigint = 0n,
): Promise<{ skipped: boolean; opHash?: Hex }> {
  const contracts = getContractAddresses();
  if (!contracts.bingoCard) {
    throw new Error('BingoCard address not set');
  }
  const spender = contracts.bingoCard;
  const tierAmountWei = cardPriceWei;

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
      args: [smartAccountAddress, spender],
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

  // mintCard forwards the Pyth entropy fee as native msg.value (sent as
  // fee*2). Keep that much native UNWRAPPED — otherwise wrapping all of it
  // leaves the account unable to pay the fee, and mintCard reverts with an
  // opaque 0x during simulation. Reserve a small cushion (fee*3).
  const feeReserve = entropyFeeWei * 3n;
  const amountToWrap =
    wusdeBalance < tierAmountWei ? tierAmountWei - wusdeBalance : 0n;
  if (nativeBalance < amountToWrap + feeReserve) {
    throw new Error(
      `Smart account needs more native USDe: have ${nativeBalance}, ` +
        `need ${amountToWrap + feeReserve} (collateral to wrap + entropy fee).`,
    );
  }
  if (amountToWrap > 0n) {
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
        args: [spender, tierAmountWei],
      }),
      value: 0n,
    });
    console.log(
      '[prepareAccount] will approve bingoCard=' +
        spender +
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

  // Verify post-state so we know the approval really stuck before the mint fires.
  const allowanceAfter = (await publicClient.readContract({
    address: contracts.wusde,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [smartAccountAddress, spender],
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
// mintCardViaSession — buy a BingoCard as the smart account
// ============================================================================

/**
 * Mints a BingoCard as the session's smart account so `card.player` is the SA
 * (required for the sponsored per-line escrow mints and the bonus claim, which
 * all run as the same identity). Wraps + approves the card price first, then
 * sends the payable `mintCard` UserOp and recovers the new cardId from the
 * `CardMinted` event.
 */
export async function mintCardViaSession(params: {
  client: KernelAccountClient;
  smartAccountAddress: Address;
  cardPriceWei: bigint;
  refCode: Hex;
  entropyFeeWei: bigint;
}): Promise<{ cardId: bigint; opHash: Hex; txHash?: Hex }> {
  const { client, smartAccountAddress, cardPriceWei, refCode, entropyFeeWei } =
    params;
  const contracts = getContractAddresses();
  if (!contracts.bingoCard) throw new Error('BingoCard address not set');
  if (!client.account) throw new Error('Session client account missing');
  const bingoCard = contracts.bingoCard;

  // Ensure the SA holds wUSDe and has approved the BingoCard for the price.
  await prepareAccount(
    client,
    cardPriceWei,
    smartAccountAddress,
    entropyFeeWei,
  );

  // 2x entropy-fee buffer so a fee bump between read and submit doesn't revert;
  // the BingoCard refunds the unused remainder.
  const value = entropyFeeWei * 2n;
  const opHash = await client.sendUserOperation({
    callData: await client.account.encodeCalls([
      {
        to: bingoCard,
        data: encodeFunctionData({
          abi: BINGO_CARD_ABI,
          functionName: 'mintCard',
          args: [refCode, cardPriceWei],
        }),
        value,
      },
    ]),
  });
  const receipt = await client.waitForUserOperationReceipt({ hash: opHash });
  if (!receipt.success) {
    const detail = receipt.reason ? `: ${receipt.reason}` : '';
    throw new Error(`Card mint reverted${detail}`);
  }
  const txHash = receipt.receipt?.transactionHash as Hex | undefined;

  let cardId: bigint | undefined;
  const publicClient = getPublicClient();
  if (txHash) {
    const txReceipt = await publicClient.getTransactionReceipt({
      hash: txHash,
    });
    const events = parseEventLogs({
      abi: BINGO_CARD_ABI,
      eventName: 'CardMinted',
      logs: txReceipt.logs,
    });
    const own = events.find(
      (e) => e.address.toLowerCase() === bingoCard.toLowerCase(),
    );
    if (own && own.args && 'cardId' in own.args) {
      cardId = own.args.cardId as bigint;
    }
  }
  if (cardId == null) {
    // Fallback: the just-incremented counter is this card's id.
    cardId = (await publicClient.readContract({
      address: bingoCard,
      abi: BINGO_CARD_ABI,
      functionName: 'nextCardId',
    })) as bigint;
  }
  return { cardId, opHash: opHash as Hex, txHash };
}

// ============================================================================
// Player actions as the smart account (setCellSides / claim / withdraw)
// ============================================================================

async function sendBingoCall(
  client: KernelAccountClient,
  data: Hex,
  label: string,
): Promise<Hex> {
  const contracts = getContractAddresses();
  if (!contracts.bingoCard) throw new Error('BingoCard address not set');
  if (!client.account) throw new Error('Session client account missing');
  const opHash = await client.sendUserOperation({
    callData: await client.account.encodeCalls([
      { to: contracts.bingoCard, data, value: 0n },
    ]),
  });
  const receipt = await client.waitForUserOperationReceipt({ hash: opHash });
  if (!receipt.success) {
    const detail = receipt.reason ? `: ${receipt.reason}` : '';
    throw new Error(`${label} reverted${detail}`);
  }
  return (receipt.receipt?.transactionHash as Hex) ?? (opHash as Hex);
}

export function setCellSidesViaSession(
  client: KernelAccountClient,
  cardId: bigint,
  yesMask: number,
): Promise<Hex> {
  return sendBingoCall(
    client,
    encodeFunctionData({
      abi: BINGO_CARD_ABI,
      functionName: 'setCellSides',
      args: [cardId, yesMask],
    }),
    'setCellSides',
  );
}

export function claimBonusViaSession(
  client: KernelAccountClient,
  cardId: bigint,
): Promise<Hex> {
  return sendBingoCall(
    client,
    encodeFunctionData({
      abi: BINGO_CARD_ABI,
      functionName: 'claimBonus',
      args: [cardId],
    }),
    'claimBonus',
  );
}

/** Redeem a won line's predictor position tokens for their collateral payout. */
export async function redeemViaSession(
  client: KernelAccountClient,
  positionToken: Address,
  amount: bigint,
): Promise<Hex> {
  const contracts = getContractAddresses();
  if (!contracts.predictionMarketEscrow) {
    throw new Error('Escrow address not set');
  }
  if (!client.account) throw new Error('Session client account missing');
  const data = encodeFunctionData({
    abi: predictionMarketEscrowAbi,
    functionName: 'redeem',
    args: [positionToken, amount, `0x${'00'.repeat(32)}` as Hex],
  });
  const opHash = await client.sendUserOperation({
    callData: await client.account.encodeCalls([
      { to: contracts.predictionMarketEscrow, data, value: 0n },
    ]),
  });
  const receipt = await client.waitForUserOperationReceipt({ hash: opHash });
  if (!receipt.success) {
    const detail = receipt.reason ? `: ${receipt.reason}` : '';
    throw new Error(`Redeem reverted${detail}`);
  }
  return (receipt.receipt?.transactionHash as Hex) ?? (opHash as Hex);
}

export function withdrawUnusedViaSession(
  client: KernelAccountClient,
  cardId: bigint,
): Promise<Hex> {
  return sendBingoCall(
    client,
    encodeFunctionData({
      abi: BINGO_CARD_ABI,
      functionName: 'withdrawUnused',
      args: [cardId],
    }),
    'withdrawUnused',
  );
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

