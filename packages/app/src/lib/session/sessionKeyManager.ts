import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  slice,
  type Address,
  type Hex,
  type Chain,
  type Hash,
  type EIP1193Provider,
} from 'viem';
import { arbitrum } from 'viem/chains';
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  addressToEmptyAccount, // Still needed for getSmartAccountAddress
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
  CallPolicyVersion,
  ParamCondition,
} from '@zerodev/permissions/policies';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import {
  predictionMarketAbi,
  collateralTokenAbi,
  liquidityVaultAbi,
} from '@sapience/sdk/abis';
import {
  predictionMarket as predictionMarketAddresses,
  collateralToken as collateralTokenAddresses,
  eas as easAddresses,
  passiveLiquidityVault as vaultAddresses,
} from '@sapience/sdk/contracts';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ARBITRUM,
  etherealChain,
} from '@sapience/sdk/constants';

// Re-export etherealChain as 'ethereal' for backward compatibility
export { etherealChain as ethereal };

const WUSDE_ADDRESS_ETHEREAL =
  collateralTokenAddresses[CHAIN_ID_ETHEREAL].address;
const PREDICTION_MARKET_ETHEREAL =
  predictionMarketAddresses[CHAIN_ID_ETHEREAL].address;
const VAULT_ETHEREAL = vaultAddresses[CHAIN_ID_ETHEREAL].address;
const EAS_ARBITRUM = easAddresses[CHAIN_ID_ARBITRUM].address;

const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

// EAS ABI for attestations
const EAS_ABI = parseAbi([
  'function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) payable returns (bytes32)',
]);

// ZeroDev constants
const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

/**
 * Get ZeroDev bundler/paymaster URLs for a chain.
 * ZeroDev v3 API format: https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}
 */
function getZeroDevUrls(chainId: number): {
  bundlerUrl: string;
  paymasterUrl: string;
} {
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set');
  }

  const baseUrl = `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;

  const envUrls: Record<number, { bundler?: string; paymaster?: string }> = {
    [etherealChain.id]: {
      bundler: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ETHEREAL,
      paymaster: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ETHEREAL,
    },
    [arbitrum.id]: {
      bundler: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ARBITRUM,
      paymaster: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ARBITRUM,
    },
  };

  const chainUrls = envUrls[chainId];
  if (!chainUrls) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  return {
    bundlerUrl: chainUrls.bundler || baseUrl,
    paymasterUrl: chainUrls.paymaster || baseUrl,
  };
}

// Session configuration
export interface SessionConfig {
  durationHours: number;
  expiresAt: number;
  ownerAddress: Address;
  smartAccountAddress: Address;
}

// EIP-712 typed data for enable signature verification
// This is captured during session creation for relayer verification
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

// Serialized session for localStorage
// We store ZeroDev approval strings which embed owner's EIP-712 signature
export interface SerializedSession {
  config: SessionConfig;
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address; // Public address of the session key
  createdAt: number;
  // ZeroDev approval strings (includes owner's enable signature)
  // Ethereal is required (signed on login for predictions + auction auth)
  etherealApproval: string;
  // Arbitrum is optional (lazy - signed on first EAS attestation)
  arbitrumApproval?: string;
  // EIP-712 typed data for relayer verification (captured during session creation)
  // This allows the relayer to verify the enable signature without reconstructing typed data
  etherealEnableTypedData?: EnableTypedData;
  arbitrumEnableTypedData?: EnableTypedData;
}

// Session result with chain clients
export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient; // required - created on login
  arbitrumClient: KernelAccountClient | null; // null until first EAS attestation
  serialized: SerializedSession;
}

// Owner signer interface (what we get from connected wallet)
// The provider should be an EIP-1193 compatible Ethereum provider
export interface OwnerSigner {
  address: Address;
  provider: EIP1193Provider;
  // Function to switch chains - needed for multi-chain session creation
  switchChain: (chainId: number) => Promise<void>;
}

/**
 * Calculate the smart account address for a given owner address.
 * This doesn't require any signatures - just computes the counterfactual address.
 */
export async function getSmartAccountAddress(
  ownerAddress: Address
): Promise<Address> {
  const publicClient = createPublicClient({
    transport: http(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'
    ),
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

  return account.address;
}

// Public clients are created once and reused
function getPublicClients() {
  const etherealPublicClient = createPublicClient({
    transport: http(etherealChain.rpcUrls.default.http[0]),
    chain: etherealChain,
  });

  const arbitrumPublicClient = createPublicClient({
    transport: http(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'
    ),
    chain: arbitrum,
  });

  return { etherealPublicClient, arbitrumPublicClient };
}

/**
 * Create a new session with time-limited permissions.
 * Uses ZeroDev's serializePermissionAccount to capture owner's EIP-712 approval.
 * Only creates Ethereal session on login - Arbitrum session is created lazily.
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number
): Promise<SessionResult> {
  console.debug('[SessionKeyManager] Creating new session...');

  // Generate session private key
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  console.debug(
    '[SessionKeyManager] New session key address:',
    sessionKeyAccount.address
  );

  // Create session key signer for ZeroDev
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Calculate expiration
  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

  // Time bounds for session validity
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validUntilInSeconds = nowInSeconds + durationHours * 60 * 60;

  console.debug(
    `[SessionKeyManager] Timestamp policy: validAfter=${nowInSeconds}, validUntil=${validUntilInSeconds}`
  );

  const timestampPolicy = toTimestampPolicy({
    validAfter: nowInSeconds,
    validUntil: validUntilInSeconds,
  });

  // Get public clients
  const { etherealPublicClient } = getPublicClients();

  // Note: CallPolicy computes permissionHash from (callType, target, selector) only,
  // NOT including args. So we CANNOT have two permissions for the same target+function.
  // Use ONE_OF condition to allow multiple approved spenders in a single permission.
  const etherealCallPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: WUSDE_ADDRESS_ETHEREAL,
        abi: WUSDE_ABI,
        functionName: 'deposit',
      },
      {
        // Single approve permission using ONE_OF to allow both PredictionMarket and Vault
        target: WUSDE_ADDRESS_ETHEREAL,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.ONE_OF,
            value: [PREDICTION_MARKET_ETHEREAL, VAULT_ETHEREAL],
          },
          null,
        ],
      },
      {
        target: PREDICTION_MARKET_ETHEREAL,
        abi: predictionMarketAbi,
        functionName: 'mint',
      },
      {
        target: PREDICTION_MARKET_ETHEREAL,
        abi: predictionMarketAbi,
        functionName: 'burn',
      },
      {
        target: PREDICTION_MARKET_ETHEREAL,
        abi: predictionMarketAbi,
        functionName: 'consolidatePrediction',
      },
      // Vault functions for gasless deposits/withdrawals
      {
        target: VAULT_ETHEREAL,
        abi: liquidityVaultAbi,
        functionName: 'requestDeposit',
      },
      {
        target: VAULT_ETHEREAL,
        abi: liquidityVaultAbi,
        functionName: 'requestWithdrawal',
      },
      {
        target: VAULT_ETHEREAL,
        abi: liquidityVaultAbi,
        functionName: 'cancelDeposit',
      },
      {
        target: VAULT_ETHEREAL,
        abi: liquidityVaultAbi,
        functionName: 'cancelWithdrawal',
      },
    ],
  });

  // Import serialization function
  const { serializePermissionAccount } = await import('@zerodev/permissions');

  // Validate Ethereal bundler/paymaster URLs (will throw if not configured)
  getZeroDevUrls(etherealChain.id);

  let etherealEnableTypedData: EnableTypedData | undefined;

  // --- ETHEREAL CHAIN SETUP (required) ---
  console.debug('[SessionKeyManager] Setting up Ethereal session...');

  // Switch to Ethereal chain
  console.debug('[SessionKeyManager] Switching to Ethereal chain...');
  await ownerSigner.switchChain(etherealChain.id);

  // Create ECDSA validator for owner on Ethereal
  const etherealOwnerValidator = await signerToEcdsaValidator(
    etherealPublicClient,
    {
      signer: ownerSigner.provider,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    }
  );

  // Generate a unique permissionId based on session key address and timestamp
  // This ensures each session has a unique ID, preventing "duplicate permissionHash" errors
  // in the CallPolicy contract which keys stored permissions by (id, permissionHash, sender)
  const etherealPermissionId = slice(
    keccak256(
      `0x${sessionKeyAccount.address.slice(2)}${nowInSeconds.toString(16).padStart(16, '0')}` as Hex
    ),
    0,
    4
  );

  console.debug(
    '[SessionKeyManager] Generated unique Ethereal permissionId:',
    etherealPermissionId
  );

  // Create permission plugin for Ethereal with call policy and timestamp policy
  const etherealPermissionPlugin = await toPermissionValidator(
    etherealPublicClient,
    {
      entryPoint: ENTRY_POINT,
      signer: sessionKeySigner,
      policies: [etherealCallPolicy, timestampPolicy],
      kernelVersion: KERNEL_VERSION,
      permissionId: etherealPermissionId,
    }
  );

  // Create Ethereal kernel account
  const etherealAccount = await createKernelAccount(etherealPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: etherealOwnerValidator,
      regular: etherealPermissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const smartAccountAddress = etherealAccount.address;
  console.debug(
    '[SessionKeyManager] Smart account address:',
    smartAccountAddress
  );

  // Capture typed data BEFORE serialization (needed for relayer verification)
  try {
    const typedData =
      await etherealAccount.kernelPluginManager.getPluginsEnableTypedData(
        etherealAccount.address
      );
    etherealEnableTypedData = typedData as EnableTypedData;
    console.debug('[SessionKeyManager] Captured Ethereal enable typed data');
    console.debug(
      '[SessionKeyManager] Enable typed data validationId:',
      typedData?.message?.validationId
    );
    console.debug(
      '[SessionKeyManager] Enable typed data nonce:',
      typedData?.message?.nonce
    );
  } catch (e) {
    console.warn(
      '[SessionKeyManager] Failed to capture Ethereal typed data:',
      e
    );
  }

  // Serialize Ethereal account (triggers EIP-712 signature)
  console.debug(
    '[SessionKeyManager] Requesting owner approval for Ethereal session key...'
  );
  const etherealApproval = await serializePermissionAccount(
    etherealAccount,
    sessionPrivateKey
  );

  // Create Ethereal client
  const etherealClient = createChainClient(etherealChain, etherealAccount);

  console.debug('[SessionKeyManager] Owner approval obtained, session created');
  console.debug(
    '[SessionKeyManager] Arbitrum session will be created lazily on first EAS attestation'
  );

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
    // Arbitrum approval not set - will be created lazily
    etherealEnableTypedData,
  };

  return {
    config,
    etherealClient,
    arbitrumClient: null, // Will be created lazily
    serialized,
  };
}

// Result from lazy Arbitrum session creation
export interface ArbitrumSessionResult {
  arbitrumApproval: string;
  arbitrumClient: KernelAccountClient;
  arbitrumEnableTypedData?: EnableTypedData;
}

/**
 * Create Arbitrum session lazily (on first EAS attestation).
 * Uses the existing session private key from the serialized session.
 */
export async function createArbitrumSession(
  ownerSigner: OwnerSigner,
  existingSessionPrivateKey: Hex,
  expiresAt: number
): Promise<ArbitrumSessionResult> {
  console.debug('[SessionKeyManager] Creating Arbitrum session lazily...');

  // Recreate session key signer from existing private key
  const sessionKeyAccount = privateKeyToAccount(existingSessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Calculate remaining time for timestamp policy
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validUntilInSeconds = Math.floor(expiresAt / 1000);

  const timestampPolicy = toTimestampPolicy({
    validAfter: nowInSeconds,
    validUntil: validUntilInSeconds,
  });

  // Get Arbitrum public client
  const { arbitrumPublicClient } = getPublicClients();

  // Validate Arbitrum bundler/paymaster URLs (will throw if not configured)
  getZeroDevUrls(arbitrum.id);

  const arbitrumCallPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: EAS_ARBITRUM,
        abi: EAS_ABI,
        functionName: 'attest',
      },
    ],
  });

  // Generate a unique permissionId based on session key address and timestamp
  // This ensures each session has a unique ID, preventing "duplicate permissionHash" errors
  const arbitrumPermissionId = slice(
    keccak256(
      `0x${sessionKeyAccount.address.slice(2)}${nowInSeconds.toString(16).padStart(16, '0')}arb` as Hex
    ),
    0,
    4
  );

  console.debug(
    '[SessionKeyManager] Generated unique Arbitrum permissionId:',
    arbitrumPermissionId
  );

  // Switch to Arbitrum chain
  console.debug('[SessionKeyManager] Switching to Arbitrum chain...');
  await ownerSigner.switchChain(arbitrum.id);

  // Create ECDSA validator for owner on Arbitrum
  const arbitrumOwnerValidator = await signerToEcdsaValidator(
    arbitrumPublicClient,
    {
      signer: ownerSigner.provider,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    }
  );

  const arbitrumPermissionPlugin = await toPermissionValidator(
    arbitrumPublicClient,
    {
      entryPoint: ENTRY_POINT,
      signer: sessionKeySigner,
      policies: [arbitrumCallPolicy, timestampPolicy],
      kernelVersion: KERNEL_VERSION,
      permissionId: arbitrumPermissionId,
    }
  );

  // Create Arbitrum kernel account
  const arbitrumAccount = await createKernelAccount(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: arbitrumOwnerValidator,
      regular: arbitrumPermissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  // Capture typed data BEFORE serialization
  let arbitrumEnableTypedData: EnableTypedData | undefined;
  try {
    const typedData =
      await arbitrumAccount.kernelPluginManager.getPluginsEnableTypedData(
        arbitrumAccount.address
      );
    arbitrumEnableTypedData = typedData as EnableTypedData;
    console.debug('[SessionKeyManager] Captured Arbitrum enable typed data');
  } catch (e) {
    console.warn(
      '[SessionKeyManager] Failed to capture Arbitrum typed data:',
      e
    );
  }

  // Import serialization function and serialize
  const { serializePermissionAccount } = await import('@zerodev/permissions');
  console.debug(
    '[SessionKeyManager] Requesting owner approval for Arbitrum session key...'
  );
  const arbitrumApproval = await serializePermissionAccount(
    arbitrumAccount,
    existingSessionPrivateKey
  );

  // Create Arbitrum client
  const arbitrumClient = createChainClient(arbitrum, arbitrumAccount);

  console.debug('[SessionKeyManager] Arbitrum session created');

  return {
    arbitrumApproval,
    arbitrumClient,
    arbitrumEnableTypedData,
  };
}

/**
 * Restore a session from serialized data.
 * Uses ZeroDev's deserializePermissionAccount to restore accounts from approval strings.
 */
export async function restoreSession(
  serialized: SerializedSession
): Promise<SessionResult> {
  // Check if session has expired
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }

  console.debug('[SessionKeyManager] Restoring session...');

  const config: SessionConfig = serialized.config;

  // Get public clients
  const { etherealPublicClient, arbitrumPublicClient } = getPublicClients();

  // Recreate session key signer from stored private key
  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Restore Ethereal session (required)
  getZeroDevUrls(etherealChain.id); // Will throw if not configured
  const etherealAccount = await deserializePermissionAccount(
    etherealPublicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner
  );
  const etherealClient = createChainClient(etherealChain, etherealAccount);
  console.debug('[SessionKeyManager] Ethereal session restored');

  // Restore Arbitrum session (optional - may not exist yet)
  let arbitrumClient: KernelAccountClient | null = null;
  if (serialized.arbitrumApproval) {
    const arbitrumAccount = await deserializePermissionAccount(
      arbitrumPublicClient,
      ENTRY_POINT,
      KERNEL_VERSION,
      serialized.arbitrumApproval,
      sessionKeySigner
    );
    arbitrumClient = createChainClient(arbitrum, arbitrumAccount);
    console.debug('[SessionKeyManager] Arbitrum session restored');
  } else {
    console.debug(
      '[SessionKeyManager] No Arbitrum session to restore (will be created lazily)'
    );
  }

  console.debug('[SessionKeyManager] Session restoration complete');

  return {
    config,
    etherealClient,
    arbitrumClient,
    serialized,
  };
}

/**
 * Create a kernel client for a specific chain.
 */
function createChainClient(
  chain: Chain,
  account: Awaited<ReturnType<typeof createKernelAccount>>
): KernelAccountClient {
  const { bundlerUrl, paymasterUrl } = getZeroDevUrls(chain.id);

  console.debug(
    `[SessionKeyManager] Creating client for chain ${chain.id} (${chain.name})`
  );
  console.debug(`[SessionKeyManager] Bundler URL: ${bundlerUrl}`);
  console.debug(`[SessionKeyManager] Paymaster URL: ${paymasterUrl}`);

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterUrl),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: {
      getPaymasterData: async (userOperation) => {
        const paymasterStart = Date.now();
        console.log(
          `[SessionKeyManager] Requesting paymaster sponsorship for chain ${chain.id}...`
        );
        try {
          const result = await paymasterClient.sponsorUserOperation({
            userOperation,
          });
          const paymasterMs = Date.now() - paymasterStart;
          console.log(
            `[SessionKeyManager] Paymaster sponsorship received in ${paymasterMs}ms`
          );
          return result;
        } catch (error: unknown) {
          const paymasterMs = Date.now() - paymasterStart;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[SessionKeyManager] Paymaster error after ${paymasterMs}ms:`,
            errorMessage
          );
          throw error;
        }
      },
    },
  });
}

/**
 * Storage key for session data.
 */
export const SESSION_STORAGE_KEY = 'sapience:session';

/**
 * Save session to localStorage.
 */
export function saveSession(serialized: SerializedSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(serialized));
}

/**
 * Load session from localStorage.
 */
export function loadSession(): SerializedSession | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as SerializedSession;

    // Check if expired
    if (Date.now() > parsed.config.expiresAt) {
      clearSession();
      return null;
    }

    // Migration: Clear old sessions without Ethereal approval
    // Old sessions had Arbitrum required, new sessions have Ethereal required
    if (!parsed.etherealApproval) {
      console.debug(
        '[SessionKeyManager] Clearing old session format (missing Ethereal approval)'
      );
      clearSession();
      return null;
    }

    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Clear session from localStorage.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  console.debug('[SessionKeyManager] Clearing session from localStorage');
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Execute a transaction using the owner's wallet (sudo validator).
 * This bypasses session key permissions and requires an explicit wallet signature.
 * Use this for sensitive operations like withdrawals that shouldn't be allowed via session keys.
 */
export async function executeSudoTransaction(
  ownerSigner: OwnerSigner,
  calls: { to: Address; data: Hex; value: bigint }[],
  chainId: number
): Promise<Hash> {
  console.debug(
    '[SessionKeyManager] Executing sudo transaction with owner signature...'
  );

  // Get the appropriate chain config and public client
  const chain = chainId === etherealChain.id ? etherealChain : arbitrum;
  const { etherealPublicClient, arbitrumPublicClient } = getPublicClients();
  const publicClient =
    chainId === etherealChain.id ? etherealPublicClient : arbitrumPublicClient;

  // Switch to the correct chain
  console.debug(`[SessionKeyManager] Switching to chain ${chainId}...`);
  await ownerSigner.switchChain(chainId);

  // Create ECDSA validator for owner (sudo)
  const ownerValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner.provider,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Create kernel account with sudo validator only
  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ownerValidator,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  console.debug('[SessionKeyManager] Smart account address:', account.address);

  // Create kernel client for the chain (with paymaster for gas sponsorship)
  const client = createChainClient(chain, account);

  // Execute the calls
  console.debug(
    `[SessionKeyManager] Sending ${calls.length} call(s) with owner signature...`
  );

  const txHash = await client.sendUserOperation({
    callData: await account.encodeCalls(calls),
  });

  console.debug('[SessionKeyManager] UserOperation hash:', txHash);

  // Wait for the transaction to be mined
  const receipt = await client.waitForUserOperationReceipt({
    hash: txHash,
  });

  console.debug(
    '[SessionKeyManager] Transaction mined:',
    receipt.receipt.transactionHash
  );

  return receipt.receipt.transactionHash;
}
