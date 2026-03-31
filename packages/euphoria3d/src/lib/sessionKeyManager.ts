import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  http,
  keccak256,
  slice,
  encodeFunctionData,
  type Address,
  type Hex,
  type Chain,
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
  predictionMarketEscrow as predictionMarketEscrowAddresses,
  collateralToken as collateralTokenAddresses,
} from '@sapience/sdk/contracts';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import type { EIP1193Provider } from 'viem';

// ZeroDev constants
const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

const WUSDE_ABI = [
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
] as const;

// --- Contract address resolution ---

function getContractAddresses(chainId: number) {
  const effectiveChainId =
    chainId === CHAIN_ID_ETHEREAL_TESTNET ? CHAIN_ID_ETHEREAL_TESTNET : CHAIN_ID_ETHEREAL;
  const escrowAddress = predictionMarketEscrowAddresses[effectiveChainId]?.address;
  const isEscrowDeployed =
    escrowAddress && escrowAddress !== '0x0000000000000000000000000000000000000000';
  return {
    wusde: collateralTokenAddresses[effectiveChainId].address,
    predictionMarketEscrow: isEscrowDeployed ? escrowAddress : undefined,
  };
}

// --- ZeroDev URL resolution ---

function getZeroDevUrls(chainId: number): { bundlerUrl: string; paymasterUrl: string } {
  const projectId = import.meta.env.VITE_ZERODEV_PROJECT_ID;
  if (!projectId) throw new Error('VITE_ZERODEV_PROJECT_ID is not set');

  const baseUrl = `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;

  const envUrls: Record<number, { bundler?: string; paymaster?: string }> = {
    [etherealChain.id]: {
      bundler: import.meta.env.VITE_ZERODEV_BUNDLER_URL_ETHEREAL,
      paymaster: import.meta.env.VITE_ZERODEV_PAYMASTER_URL_ETHEREAL,
    },
    [etherealTestnetChain.id]: {
      bundler: import.meta.env.VITE_ZERODEV_BUNDLER_URL_ETHEREAL_TESTNET,
      paymaster: import.meta.env.VITE_ZERODEV_PAYMASTER_URL_ETHEREAL_TESTNET,
    },
  };

  const chainUrls = envUrls[chainId];
  if (!chainUrls) throw new Error(`Unsupported chain ID: ${chainId}`);

  return {
    bundlerUrl: chainUrls.bundler || baseUrl,
    paymasterUrl: chainUrls.paymaster || baseUrl,
  };
}

// --- Chain helpers ---

function getEtherealChain(chainId: number): Chain {
  return chainId === CHAIN_ID_ETHEREAL_TESTNET ? etherealTestnetChain : etherealChain;
}

function getEtherealPublicClient(chainId: number) {
  const chain = getEtherealChain(chainId);
  return createPublicClient({
    transport: http(chain.rpcUrls.default.http[0]),
    chain,
  });
}

// --- Viem 2.33+ compatibility ---

/**
 * Strip `parameters` field from userOp in RPC requests.
 * viem 2.33+ adds this for EIP-7702 but ZeroDev doesn't recognize it.
 */
function stripParametersFromUserOp(params: unknown): unknown {
  if (!Array.isArray(params)) return params;
  return params.map((param) => {
    if (param && typeof param === 'object' && 'userOp' in param) {
      const { userOp, ...rest } = param as { userOp: Record<string, unknown> };
      if (userOp && typeof userOp === 'object' && 'parameters' in userOp) {
        const { parameters: _parameters, ...cleanUserOp } = userOp;
        return { ...rest, userOp: cleanUserOp };
      }
    }
    return param;
  });
}

function createZeroDevCompatibleTransport(url: string): ReturnType<typeof http> {
  const baseTransport = http(url);
  return ((config: unknown) => {
    const transport = (baseTransport as Function)(config);
    return {
      ...transport,
      request: async (args: { method: string; params?: unknown }) => {
        if (
          args.params &&
          (args.method === 'zd_sponsorUserOperation' ||
            args.method === 'eth_estimateUserOperationGas' ||
            args.method === 'eth_sendUserOperation')
        ) {
          return transport.request({
            ...args,
            params: stripParametersFromUserOp(args.params),
          });
        }
        return transport.request(args);
      },
    };
  }) as unknown as ReturnType<typeof http>;
}

// --- Exported types ---

export interface SessionConfig {
  durationHours: number;
  expiresAt: number;
  ownerAddress: Address;
  smartAccountAddress: Address;
}

export interface EnableTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    Enable: readonly { name: string; type: string }[];
  };
  primaryType: 'Enable';
  message: {
    validationId: Hex;
    nonce: number;
    hook: Address;
    validatorData: Hex;
    hookData: Hex;
    selectorData: Hex;
  };
}

export interface SerializedSession {
  config: SessionConfig;
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address;
  createdAt: number;
  etherealApproval: string;
  etherealEnableTypedData?: EnableTypedData;
  etherealChainId?: number;
}

export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient;
  serialized: SerializedSession;
}

export type SessionCreationStep =
  | 'switching-network'
  | 'requesting-approval'
  | 'deploying-account'
  | 'finalizing';

export interface OwnerSigner {
  address: Address;
  provider: EIP1193Provider;
  switchChain: (chainId: number) => Promise<void>;
}

// --- Core functions ---

export function getSmartAccountAddress(ownerAddress: Address): Address {
  return computeSmartAccountAddress(ownerAddress);
}

/**
 * Create a new session with time-limited permissions for euphoria3d.
 * Permissions: wUSDe.deposit, wUSDe.approve(escrow), escrow.mint/redeem/settle
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number,
  etherealChainId: number = CHAIN_ID_ETHEREAL,
  onProgress?: (step: SessionCreationStep) => void,
): Promise<SessionResult> {
  console.debug('[Session] Creating new session...');

  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  console.debug('[Session] Session key:', sessionKeyAccount.address);

  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validUntilInSeconds = nowInSeconds + durationHours * 60 * 60;

  const timestampPolicy = toTimestampPolicy({
    validAfter: 0,
    validUntil: validUntilInSeconds,
  });

  const selectedChain = getEtherealChain(etherealChainId);
  const publicClient = getEtherealPublicClient(etherealChainId);
  const contracts = getContractAddresses(etherealChainId);

  console.debug('[Session] Chain:', selectedChain.name, etherealChainId);
  console.debug('[Session] Contracts:', contracts);

  // Build call policy — only what euphoria3d needs
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      // Wrap native USDe → wUSDe
      {
        target: contracts.wusde,
        abi: WUSDE_ABI,
        functionName: 'deposit',
        valueLimit: BigInt(1e24), // 1M USDe
      },
      // Approve escrow to spend wUSDe
      ...(contracts.predictionMarketEscrow
        ? [
            {
              target: contracts.wusde,
              abi: collateralTokenAbi,
              functionName: 'approve' as const,
              args: [
                {
                  condition: ParamCondition.ONE_OF as typeof ParamCondition.ONE_OF,
                  value: [contracts.predictionMarketEscrow] as Address[],
                },
                null,
              ],
            },
          ]
        : []),
      // Escrow: mint, redeem, settle
      ...(contracts.predictionMarketEscrow
        ? [
            {
              target: contracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'mint' as const,
            },
            {
              target: contracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'redeem' as const,
            },
            {
              target: contracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'settle' as const,
            },
          ]
        : []),
    ],
  });

  // Signature caller policy: allows escrow to call isValidSignature() on smart account
  const signatureCallerPolicy = toSignatureCallerPolicy({
    allowedCallers: [contracts.predictionMarketEscrow].filter(Boolean) as Address[],
  });

  // Validate ZeroDev URLs
  getZeroDevUrls(etherealChainId);

  let enableTypedData: EnableTypedData | undefined;

  // Switch chain if needed
  const currentChainHex = await ownerSigner.provider.request({ method: 'eth_chainId' });
  const currentChainId = parseInt(currentChainHex as string, 16);
  if (currentChainId !== etherealChainId) {
    onProgress?.('switching-network');
    console.debug(`[Session] Switching from ${currentChainId} to ${etherealChainId}`);
    await ownerSigner.switchChain(etherealChainId);
  }

  // Create ECDSA validator for owner
  const ownerValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner.provider,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Unique permissionId per session
  const permissionId = slice(
    keccak256(
      `0x${sessionKeyAccount.address.slice(2)}${nowInSeconds.toString(16).padStart(16, '0')}` as Hex,
    ),
    0,
    4,
  );

  // Create permission plugin
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint: ENTRY_POINT,
    signer: sessionKeySigner,
    policies: [callPolicy, timestampPolicy, signatureCallerPolicy],
    kernelVersion: KERNEL_VERSION,
    permissionId,
  });

  // Create kernel account
  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: ownerValidator,
      regular: permissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const smartAccountAddress = kernelAccount.address;
  console.debug('[Session] Smart account:', smartAccountAddress);

  // Capture typed data before serialization
  try {
    const td = await kernelAccount.kernelPluginManager.getPluginsEnableTypedData(
      kernelAccount.address,
    );
    enableTypedData = td as EnableTypedData;
  } catch (e) {
    console.warn('[Session] Failed to capture enable typed data:', e);
  }

  // Serialize (triggers EIP-712 wallet signature)
  onProgress?.('requesting-approval');
  const { serializePermissionAccount: serialize } = await import('@zerodev/permissions');
  const etherealApproval = await serialize(kernelAccount, sessionPrivateKey);

  // Create client
  const etherealClient = createChainClient(selectedChain, kernelAccount);

  // Deploy smart account if not already deployed
  onProgress?.('deploying-account');
  const deployedCode = await publicClient.getCode({ address: smartAccountAddress });
  if (!deployedCode || deployedCode === '0x') {
    console.debug('[Session] Deploying smart account...');
    try {
      // Use approve(escrow, 0) as a harmless call within CallPolicy
      if (contracts.predictionMarketEscrow) {
        await etherealClient.sendUserOperation({
          callData: await kernelAccount.encodeCalls([
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
        console.debug('[Session] Smart account deployed');
      }
    } catch (e) {
      console.warn('[Session] Deploy failed (non-fatal):', e);
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
    etherealEnableTypedData: enableTypedData,
    etherealChainId,
  };

  return { config, etherealClient, serialized };
}

/**
 * Restore a session from localStorage data.
 */
export async function restoreSession(serialized: SerializedSession): Promise<SessionResult> {
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }

  console.debug('[Session] Restoring...');

  const etherealChainId = serialized.etherealChainId ?? CHAIN_ID_ETHEREAL;
  const selectedChain = getEtherealChain(etherealChainId);
  const publicClient = getEtherealPublicClient(etherealChainId);

  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  getZeroDevUrls(etherealChainId);
  const account = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner,
  );
  const etherealClient = createChainClient(selectedChain, account);
  console.debug('[Session] Restored');

  // Ensure smart account is deployed
  const deployedCode = await publicClient.getCode({ address: account.address });
  if (!deployedCode || deployedCode === '0x') {
    console.debug('[Session] Deploying smart account on restore...');
    try {
      const contracts = getContractAddresses(etherealChainId);
      if (contracts.predictionMarketEscrow) {
        await etherealClient.sendUserOperation({
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
      }
    } catch (e) {
      console.warn('[Session] Deploy on restore failed:', e);
    }
  }

  return { config: serialized.config, etherealClient, serialized };
}

function createChainClient(
  chain: Chain,
  account: Awaited<ReturnType<typeof createKernelAccount>>,
): KernelAccountClient {
  const { bundlerUrl, paymasterUrl } = getZeroDevUrls(chain.id);

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: createZeroDevCompatibleTransport(paymasterUrl),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: createZeroDevCompatibleTransport(bundlerUrl),
    paymaster: {
      getPaymasterData: async (userOperation) => {
        try {
          return await paymasterClient.sponsorUserOperation({ userOperation });
        } catch (error) {
          console.error('[Session] Paymaster error:', error);
          throw error;
        }
      },
    },
  });
}

// --- localStorage ---

const SESSION_STORAGE_KEY = 'euphoria3d:session';

export function saveSession(serialized: SerializedSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(serialized));
}

export function loadSession(): SerializedSession | null {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as SerializedSession;
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
  console.debug('[Session] Clearing from localStorage');
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
