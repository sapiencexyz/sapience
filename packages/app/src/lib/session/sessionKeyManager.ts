import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Hex,
  type Chain,
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
} from '@sapience/sdk/abis';
import {
  predictionMarket as predictionMarketAddresses,
  collateralToken as collateralTokenAddresses,
  eas as easAddresses,
  passiveLiquidityVault as vaultAddresses,
} from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';

// Ethereal chain definition
export const ethereal: Chain = {
  id: 5064014,
  name: 'Ethereal',
  nativeCurrency: { decimals: 18, name: 'USDe', symbol: 'USDe' },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
};

const WUSDE_ADDRESS_ETHEREAL = collateralTokenAddresses[CHAIN_ID_ETHEREAL].address;
const PREDICTION_MARKET_ETHEREAL = predictionMarketAddresses[CHAIN_ID_ETHEREAL].address;
const EAS_ETHEREAL = easAddresses[CHAIN_ID_ETHEREAL].address;
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

// Get bundler/paymaster URLs from environment
// ZeroDev v3 API format: https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}
const getZeroDevUrls = (chainId: number): { bundlerUrl: string; paymasterUrl: string } | null => {
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set');
  }

  // ZeroDev v3 uses a unified RPC endpoint for both bundler and paymaster
  const baseUrl = `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;

  // Ethereal requires custom bundler/paymaster URLs (not supported by ZeroDev by default)
  if (chainId === ethereal.id) {
    const bundlerUrl = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ETHEREAL;
    const paymasterUrl = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ETHEREAL;
    // Return null if Ethereal URLs not configured - Ethereal session will be skipped
    if (!bundlerUrl || !paymasterUrl) {
      console.debug('[SessionKeyManager] Ethereal bundler/paymaster URLs not configured, skipping Ethereal session');
      return null;
    }
    return { bundlerUrl, paymasterUrl };
  }

  if (chainId === arbitrum.id) {
    return {
      bundlerUrl: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ARBITRUM || baseUrl,
      paymasterUrl: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ARBITRUM || baseUrl,
    };
  }

  throw new Error(`Unsupported chain ID: ${chainId}`);
};

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
  // Ethereal is optional (only if bundler/paymaster configured)
  etherealApproval?: string;
  arbitrumApproval: string;
  // EIP-712 typed data for relayer verification (captured during session creation)
  // This allows the relayer to verify the enable signature without reconstructing typed data
  arbitrumEnableTypedData?: EnableTypedData;
  etherealEnableTypedData?: EnableTypedData;
}

// Session result with chain clients
export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient<any, any, any> | null; // null if Ethereal not configured
  arbitrumClient: KernelAccountClient<any, any, any>;
  serialized: SerializedSession;
}

// Owner signer interface (what we get from connected wallet)
// The provider should be an EIP-1193 compatible Ethereum provider
export interface OwnerSigner {
  address: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any; // EIP-1193 provider - ZeroDev accepts this via toSigner
  // Function to switch chains - needed for multi-chain session creation
  switchChain: (chainId: number) => Promise<void>;
}

/**
 * Calculate the smart account address for a given owner address.
 * This doesn't require any signatures - just computes the counterfactual address.
 */
export async function getSmartAccountAddress(ownerAddress: Address): Promise<Address> {
  const publicClient = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
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
    transport: http(ethereal.rpcUrls.default.http[0]),
    chain: ethereal,
  });

  const arbitrumPublicClient = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    chain: arbitrum,
  });

  return { etherealPublicClient, arbitrumPublicClient };
}

/**
 * Create a new session with time-limited permissions.
 * Uses ZeroDev's serializePermissionAccount to capture owner's EIP-712 approval.
 * The owner will be prompted to sign EIP-712 typed data messages for each chain.
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number
): Promise<SessionResult> {
  console.debug('[SessionKeyManager] Creating new session...');

  // Generate session private key
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // Create session key signer for ZeroDev
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Calculate expiration
  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

  // Time 
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validUntilInSeconds = nowInSeconds + durationHours * 60 * 60;
  
  const timestampPolicy = toTimestampPolicy({
    validAfter: nowInSeconds,
    validUntil: validUntilInSeconds,
  });


  // Get public clients
  const { etherealPublicClient, arbitrumPublicClient } = getPublicClients();


  const etherealCallPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: WUSDE_ADDRESS_ETHEREAL,
        abi: WUSDE_ABI,
        functionName: 'deposit',
      },
      {
        target: WUSDE_ADDRESS_ETHEREAL,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.EQUAL,
            value: PREDICTION_MARKET_ETHEREAL, 
          },
          null, 
        ],
      },
      {
        target: WUSDE_ADDRESS_ETHEREAL,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.EQUAL,
            value: VAULT_ETHEREAL, 
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
    ],
  });


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

  // Import serialization function
  const { serializePermissionAccount } = await import('@zerodev/permissions');

  // Check which chains have bundler/paymaster URLs configured
  const etherealUrls = getZeroDevUrls(ethereal.id);
  const arbitrumUrls = getZeroDevUrls(arbitrum.id);

  let etherealApproval: string | undefined;
  let etherealClient: KernelAccountClient<any, any, any> | null = null;
  let smartAccountAddress: Address;
  let etherealEnableTypedData: EnableTypedData | undefined;
  let arbitrumEnableTypedData: EnableTypedData | undefined;

  // --- ETHEREAL CHAIN SETUP (optional) ---
  if (etherealUrls) {
    console.debug('[SessionKeyManager] Setting up Ethereal session...');

    // Switch to Ethereal chain
    console.debug('[SessionKeyManager] Switching to Ethereal chain...');
    await ownerSigner.switchChain(ethereal.id);

    // Create ECDSA validator for owner on Ethereal
    const etherealOwnerValidator = await signerToEcdsaValidator(etherealPublicClient, {
      signer: ownerSigner.provider,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    // Create permission plugin for Ethereal with call policy and timestamp policy
    const etherealPermissionPlugin = await toPermissionValidator(etherealPublicClient, {
      entryPoint: ENTRY_POINT,
      signer: sessionKeySigner,
      policies: [etherealCallPolicy, timestampPolicy],
      kernelVersion: KERNEL_VERSION,
    });

    // Create Ethereal kernel account
    const etherealAccount = await createKernelAccount(etherealPublicClient, {
      entryPoint: ENTRY_POINT,
      plugins: {
        sudo: etherealOwnerValidator,
        regular: etherealPermissionPlugin,
      },
      kernelVersion: KERNEL_VERSION,
    });

    smartAccountAddress = etherealAccount.address;
    console.debug('[SessionKeyManager] Smart account address:', smartAccountAddress);

    // Capture typed data BEFORE serialization (needed for relayer verification)
    try {
      const typedData = await etherealAccount.kernelPluginManager.getPluginsEnableTypedData(
        etherealAccount.address
      );
      etherealEnableTypedData = typedData as EnableTypedData;
      console.debug('[SessionKeyManager] Captured Ethereal enable typed data');
    } catch (e) {
      console.warn('[SessionKeyManager] Failed to capture Ethereal typed data:', e);
    }

    // Serialize Ethereal account (triggers EIP-712 signature)
    console.debug('[SessionKeyManager] Requesting owner approval for Ethereal session key...');
    etherealApproval = await serializePermissionAccount(
      etherealAccount,
      sessionPrivateKey
    );

    // Create Ethereal client
    etherealClient = await createChainClient(ethereal, etherealAccount);
  } else {
    console.debug('[SessionKeyManager] Skipping Ethereal session (not configured)');
  }

  // --- ARBITRUM CHAIN SETUP (required) ---
  if (!arbitrumUrls) {
    throw new Error('Arbitrum bundler/paymaster URLs are required');
  }

  // Switch to Arbitrum chain
  console.debug('[SessionKeyManager] Switching to Arbitrum chain...');
  await ownerSigner.switchChain(arbitrum.id);

  // Create ECDSA validator for owner on Arbitrum
  const arbitrumOwnerValidator = await signerToEcdsaValidator(arbitrumPublicClient, {
    signer: ownerSigner.provider,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumPermissionPlugin = await toPermissionValidator(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    signer: sessionKeySigner,
    policies: [arbitrumCallPolicy, timestampPolicy],
    kernelVersion: KERNEL_VERSION,
  });

  // Create Arbitrum kernel account
  const arbitrumAccount = await createKernelAccount(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: arbitrumOwnerValidator,
      regular: arbitrumPermissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  // Use Arbitrum account address if Ethereal wasn't created
  if (!smartAccountAddress!) {
    smartAccountAddress = arbitrumAccount.address;
    console.debug('[SessionKeyManager] Smart account address (from Arbitrum):', smartAccountAddress);
  }

  // Capture typed data BEFORE serialization (needed for relayer verification)
  try {
    const typedData = await arbitrumAccount.kernelPluginManager.getPluginsEnableTypedData(
      arbitrumAccount.address
    );
    arbitrumEnableTypedData = typedData as EnableTypedData;
    console.debug('[SessionKeyManager] Captured Arbitrum enable typed data');
  } catch (e) {
    console.warn('[SessionKeyManager] Failed to capture Arbitrum typed data:', e);
  }

  // Serialize Arbitrum account (triggers EIP-712 signature)
  console.debug('[SessionKeyManager] Requesting owner approval for Arbitrum session key...');
  const arbitrumApproval = await serializePermissionAccount(
    arbitrumAccount,
    sessionPrivateKey
  );

  console.debug('[SessionKeyManager] Owner approval obtained, session created');

  // Create Arbitrum client
  const arbitrumClient = await createChainClient(arbitrum, arbitrumAccount);

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
    arbitrumApproval,
    // Include typed data for relayer verification
    arbitrumEnableTypedData,
    etherealEnableTypedData,
  };

  return {
    config,
    etherealClient,
    arbitrumClient,
    serialized,
  };
}

/**
 * Restore a session from serialized data.
 * Uses ZeroDev's deserializePermissionAccount to restore accounts from approval strings.
 */
export async function restoreSession(serialized: SerializedSession): Promise<SessionResult> {
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

  // Restore Ethereal session (optional)
  let etherealClient: KernelAccountClient<any, any, any> | null = null;
  if (serialized.etherealApproval) {
    const etherealUrls = getZeroDevUrls(ethereal.id);
    if (etherealUrls) {
      const etherealAccount = await deserializePermissionAccount(
        etherealPublicClient,
        ENTRY_POINT,
        KERNEL_VERSION,
        serialized.etherealApproval,
        sessionKeySigner
      );
      etherealClient = await createChainClient(ethereal, etherealAccount);
      console.debug('[SessionKeyManager] Ethereal session restored');
    }
  }

  // Restore Arbitrum session (required)
  const arbitrumAccount = await deserializePermissionAccount(
    arbitrumPublicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.arbitrumApproval,
    sessionKeySigner
  );
  const arbitrumClient = await createChainClient(arbitrum, arbitrumAccount);

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
async function createChainClient(
  chain: Chain,
  account: Awaited<ReturnType<typeof createKernelAccount>>
): Promise<KernelAccountClient<any, any, any>> {
  const urls = getZeroDevUrls(chain.id);
  if (!urls) {
    throw new Error(`No bundler/paymaster URLs configured for chain ${chain.id}`);
  }
  const { bundlerUrl, paymasterUrl } = urls;

  console.debug(`[SessionKeyManager] Creating client for chain ${chain.id} (${chain.name})`);
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
        console.debug(`[SessionKeyManager] Requesting paymaster sponsorship for chain ${chain.id}...`);
        try {
          const result = await paymasterClient.sponsorUserOperation({ userOperation });
          console.debug(`[SessionKeyManager] Paymaster sponsorship received`);
          return result;
        } catch (error: any) {
          console.error(`[SessionKeyManager] Paymaster error:`, error?.message || error);
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

    // Migration: Clear old sessions without ZeroDev approval
    // Old sessions used ownerSignature instead of approval strings
    // Arbitrum approval is required, Ethereal is optional
    if (!parsed.arbitrumApproval) {
      console.debug('[SessionKeyManager] Clearing old session format (missing Arbitrum approval)');
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
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
