import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { http } from 'viem';
import {
  createPublicClient,
  keccak256,
  parseAbi,
  slice,
  toHex,
  encodeAbiParameters,
  encodeFunctionData,
  recoverTypedDataAddress,
  hashTypedData,
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
  secondaryMarketEscrowAbi,
  collateralTokenAbi,
  predictionMarketVaultAbi,
} from '@sapience/sdk/abis';
import {
  predictionMarketEscrow as predictionMarketEscrowAddresses,
  secondaryMarketEscrow as secondaryMarketEscrowAddresses,
  collateralToken as collateralTokenAddresses,
  eas as easAddresses,
  predictionMarketVault as vaultAddresses,
} from '@sapience/sdk/contracts';
import {
  CHAIN_ID_ETHEREAL,
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ARBITRUM,
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { httpWithRetry, withRetry } from '../utils/util';

// Re-export etherealChain as 'ethereal' for backward compatibility
export { etherealChain as ethereal };

// Contract addresses - resolved dynamically based on chainId
function getEtherealContractAddresses(chainId: number) {
  const effectiveChainId =
    chainId === CHAIN_ID_ETHEREAL_TESTNET
      ? CHAIN_ID_ETHEREAL_TESTNET
      : DEFAULT_CHAIN_ID;
  // Get escrow address, but only use it if it's not the zero address (not deployed)
  const escrowAddress =
    predictionMarketEscrowAddresses[effectiveChainId]?.address;
  const isEscrowDeployed =
    escrowAddress &&
    escrowAddress !== '0x0000000000000000000000000000000000000000';
  const secondaryEscrowAddress =
    secondaryMarketEscrowAddresses[effectiveChainId]?.address;
  const isSecondaryEscrowDeployed =
    secondaryEscrowAddress &&
    secondaryEscrowAddress !== '0x0000000000000000000000000000000000000000';
  return {
    wusde: collateralTokenAddresses[effectiveChainId].address,
    predictionMarketEscrow: isEscrowDeployed ? escrowAddress : undefined,
    secondaryMarketEscrow: isSecondaryEscrowDeployed
      ? secondaryEscrowAddress
      : undefined,
    vault: vaultAddresses[effectiveChainId].address,
  };
}

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
 * Strip the `parameters` field from userOp objects in RPC requests.
 * viem 2.33+ adds this field for EIP-7702 support, but ZeroDev's RPC doesn't recognize it.
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

/**
 * Create a transport wrapper that strips the `parameters` field from userOp.
 * This fixes compatibility between viem 2.33+ and ZeroDev's RPC.
 */
function createZeroDevCompatibleTransport(
  url: string
): ReturnType<typeof http> {
  const baseTransport = httpWithRetry(url);

  // Return a transport factory that wraps the base transport
  return ((config) => {
    const transport = baseTransport(config);

    return {
      ...transport,
      request: async (args: { method: string; params?: unknown }) => {
        // Strip `parameters` field from userOp for ZeroDev RPC methods
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
  }) as ReturnType<typeof http>;
}

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
    [etherealTestnetChain.id]: {
      bundler: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ETHEREAL_TESTNET,
      paymaster: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ETHEREAL_TESTNET,
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

// Escrow Session Key Approval data for PredictionMarketEscrow
// This is a separate approval from ZeroDev's enable signature
export interface EscrowSessionKeyApproval {
  sessionKey: Address;
  owner: Address;
  smartAccount: Address;
  validUntil: number; // Unix timestamp in seconds
  permissionsHash: Hex; // bytes32
  chainId: number;
  ownerSignature: Hex;
}

// Escrow Session Key Approval domain and types (matches SignatureValidator.sol)
const ESCROW_SESSION_KEY_APPROVAL_DOMAIN = {
  name: 'PredictionMarketEscrow',
  version: '1',
} as const;

// Secondary Market Escrow domain (matches SecondaryMarketEscrow.sol)
const SECONDARY_ESCROW_APPROVAL_DOMAIN = {
  name: 'SecondaryMarketEscrow',
  version: '1',
} as const;

// EIP712Domain type - explicitly included for wallet compatibility
// Some wallets (like Rabby on custom chains) need this to properly recognize EIP-712 format
const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

const ESCROW_SESSION_KEY_APPROVAL_TYPES = {
  EIP712Domain: EIP712_DOMAIN_TYPE,
  SessionKeyApproval: [
    { name: 'sessionKey', type: 'address' },
    { name: 'smartAccount', type: 'address' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'permissionsHash', type: 'bytes32' },
    { name: 'chainId', type: 'uint256' },
  ],
} as const;

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
  // Which Ethereal chain was used (mainnet or testnet)
  etherealChainId?: number;
  // Escrow Session Key Approval for PredictionMarketEscrow
  // This is a separate EIP-712 signature from the owner authorizing session key for escrow mints
  escrowSessionKeyApproval?: EscrowSessionKeyApproval;
  // Trade Session Key Approval for SecondaryMarketEscrow
  // Authorizes the session key with TRADE_PERMISSION for secondary market trades
  tradeSessionKeyApproval?: EscrowSessionKeyApproval;
}

// Session result with chain clients
export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient; // required - created on login
  arbitrumClient: KernelAccountClient | null; // null until first EAS attestation
  serialized: SerializedSession;
}

// Progress steps reported during session creation
export type SessionCreationStep =
  | 'switching-network'
  | 'requesting-approval'
  | 'deploying-account'
  | 'finalizing';

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
export function getSmartAccountAddress(ownerAddress: Address): Address {
  return computeSmartAccountAddress(ownerAddress);
}

/**
 * @deprecated No longer used — session keys are validated via ERC-1271 on the smart account.
 * Kept temporarily for reference during migration. Remove after staging validates.
 */
async function _signEscrowSessionKeyApproval(
  ownerSigner: OwnerSigner,
  sessionKeyAddress: Address,
  smartAccountAddress: Address,
  validUntilSeconds: number,
  chainId: number,
  verifyingContract: Address
): Promise<EscrowSessionKeyApproval> {
  // Compute a permissions hash (we use a simple hash of "V2_MINT" permission)
  // In practice, this could be more specific to the exact permissions granted
  const permissionsHash = keccak256(toHex('MINT')); // must match SignatureValidator.MINT_PERMISSION

  // For eth_signTypedData_v4, uint256 values should be hex strings when JSON serialized
  const typedData = {
    domain: {
      ...ESCROW_SESSION_KEY_APPROVAL_DOMAIN,
      chainId,
      verifyingContract,
    },
    types: ESCROW_SESSION_KEY_APPROVAL_TYPES,
    primaryType: 'SessionKeyApproval' as const,
    message: {
      sessionKey: sessionKeyAddress,
      smartAccount: smartAccountAddress,
      validUntil: String(validUntilSeconds), // uint256 as string for JSON serialization
      permissionsHash,
      chainId: String(chainId), // uint256 as string for JSON serialization
    },
  };

  console.debug(
    '[SessionKeyManager] Requesting escrow session key approval signature...'
  );
  console.debug('[SessionKeyManager] Escrow approval typed data:', {
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
  console.debug(
    '[SessionKeyManager] Escrow approval JSON:',
    JSON.stringify(typedData, null, 2)
  );

  // Sign using the owner's wallet (via EIP-1193 provider)
  const signature = await ownerSigner.provider.request({
    method: 'eth_signTypedData_v4',
    params: [ownerSigner.address, JSON.stringify(typedData)],
  });

  console.debug('[SessionKeyManager] Escrow session key approval signed');
  console.debug('[SessionKeyManager] Escrow approval signature:', signature);
  console.debug('[SessionKeyManager] Signature r:', signature.slice(0, 66));
  console.debug(
    '[SessionKeyManager] Signature s:',
    '0x' + signature.slice(66, 130)
  );
  console.debug(
    '[SessionKeyManager] Signature v:',
    '0x' + signature.slice(130, 132)
  );

  // Verify the signature recovers to the owner address
  // Build a verification message with bigint values matching the EIP-712 types
  const verificationMessage = {
    sessionKey: typedData.message.sessionKey,
    smartAccount: typedData.message.smartAccount,
    validUntil: BigInt(typedData.message.validUntil),
    permissionsHash: typedData.message.permissionsHash,
    chainId: BigInt(typedData.message.chainId),
  };
  try {
    const recoveredAddress = await recoverTypedDataAddress({
      domain: {
        ...typedData.domain,
        chainId: BigInt(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: verificationMessage,
      signature: signature,
    });
    console.debug(
      '[SessionKeyManager] Recovered signer from signature:',
      recoveredAddress
    );
    console.debug('[SessionKeyManager] Expected owner:', ownerSigner.address);
    console.debug(
      '[SessionKeyManager] Signature valid:',
      recoveredAddress.toLowerCase() === ownerSigner.address.toLowerCase()
    );

    if (recoveredAddress.toLowerCase() !== ownerSigner.address.toLowerCase()) {
      console.error(
        '[SessionKeyManager] ⚠️ SIGNATURE MISMATCH! The recovered signer does not match the owner!'
      );
      console.error(
        '[SessionKeyManager] This will cause escrow session key validation to fail on-chain.'
      );
      // Also compute and log the hash for debugging
      const typedDataHash = hashTypedData({
        domain: {
          ...typedData.domain,
          chainId: BigInt(typedData.domain.chainId),
        },
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: verificationMessage,
      });
      console.debug('[SessionKeyManager] TypedData hash:', typedDataHash);
    }
  } catch (verifyError) {
    console.warn(
      '[SessionKeyManager] Could not verify signature:',
      verifyError
    );
  }

  return {
    sessionKey: sessionKeyAddress,
    owner: ownerSigner.address,
    smartAccount: smartAccountAddress,
    validUntil: validUntilSeconds,
    permissionsHash,
    chainId,
    ownerSignature: signature,
  };
}

/**
 * Sign a TRADE_PERMISSION session key approval for SecondaryMarketEscrow.
 * The owner authorizes the session key to sign TradeApprovals.
 */
async function _signTradeSessionKeyApproval(
  ownerSigner: OwnerSigner,
  sessionKeyAddress: Address,
  smartAccountAddress: Address,
  validUntilSeconds: number,
  chainId: number,
  verifyingContract: Address
): Promise<EscrowSessionKeyApproval> {
  const permissionsHash = keccak256(toHex('TRADE')); // must match SecondaryMarketEscrow.TRADE_PERMISSION

  const typedData = {
    domain: {
      ...SECONDARY_ESCROW_APPROVAL_DOMAIN,
      chainId,
      verifyingContract,
    },
    types: ESCROW_SESSION_KEY_APPROVAL_TYPES,
    primaryType: 'SessionKeyApproval' as const,
    message: {
      sessionKey: sessionKeyAddress,
      smartAccount: smartAccountAddress,
      validUntil: String(validUntilSeconds),
      permissionsHash,
      chainId: String(chainId),
    },
  };

  console.debug(
    '[SessionKeyManager] Requesting trade session key approval signature...'
  );

  const signature = await ownerSigner.provider.request({
    method: 'eth_signTypedData_v4',
    params: [ownerSigner.address, JSON.stringify(typedData)],
  });

  console.debug('[SessionKeyManager] Trade session key approval signed');

  return {
    sessionKey: sessionKeyAddress,
    owner: ownerSigner.address,
    smartAccount: smartAccountAddress,
    validUntil: validUntilSeconds,
    permissionsHash,
    chainId,
    ownerSignature: signature,
  };
}

/**
 * Encode EscrowSessionKeyApproval to ABI-encoded bytes for contract consumption.
 * Matches the SessionKeyData struct layout (NOT SignatureValidator.SessionKeyApproval):
 *   (sessionKey, owner, validUntil, permissionsHash, chainId, ownerSignature)
 * Note: smartAccount is NOT included - the contract gets it from the MintRequest.predictor field
 */
export function encodeEscrowSessionKeyData(
  approval: EscrowSessionKeyApproval
): Hex {
  // Encode the struct fields as a tuple
  const innerEncoding = encodeAbiParameters(
    [
      { name: 'sessionKey', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'validUntil', type: 'uint256' },
      { name: 'permissionsHash', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'ownerSignature', type: 'bytes' },
    ],
    [
      approval.sessionKey,
      approval.owner,
      BigInt(approval.validUntil),
      approval.permissionsHash,
      BigInt(approval.chainId),
      approval.ownerSignature,
    ]
  );

  // Solidity's abi.decode(data, (StructWithDynamicTypes)) expects a leading offset pointer
  // The offset is 0x20 (32 bytes) pointing to where the actual struct data begins
  const offsetPointer =
    '0000000000000000000000000000000000000000000000000000000000000020';
  return `0x${offsetPointer}${innerEncoding.slice(2)}` as Hex;
}

// ABI for accountFactory verification
const ACCOUNT_FACTORY_ABI = parseAbi([
  'function getAccountAddress(address owner, uint256 index) view returns (address)',
]);

// ABI for escrow accountFactory getter
const ESCROW_ACCOUNT_FACTORY_ABI = parseAbi([
  'function accountFactory() view returns (address)',
]);

/**
 * Verify that the accountFactory returns the expected smart account address.
 * This is useful for debugging session key validation issues.
 */
export async function verifyAccountFactoryMapping(
  chainId: number,
  escrowAddress: Address,
  ownerAddress: Address,
  expectedSmartAccount: Address
): Promise<{
  accountFactoryAddress: Address;
  derivedAccountIndex0: Address;
  derivedAccountIndex1: Address;
  matchesIndex0: boolean;
  matchesIndex1: boolean;
}> {
  const publicClient = getEtherealPublicClient(chainId);

  // Get the accountFactory address from the escrow contract
  const accountFactoryAddress = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ACCOUNT_FACTORY_ABI,
    functionName: 'accountFactory',
  });

  // Get derived addresses for index 0 and 1
  const derivedAccountIndex0 = await publicClient.readContract({
    address: accountFactoryAddress,
    abi: ACCOUNT_FACTORY_ABI,
    functionName: 'getAccountAddress',
    args: [ownerAddress, 0n],
  });

  const derivedAccountIndex1 = await publicClient.readContract({
    address: accountFactoryAddress,
    abi: ACCOUNT_FACTORY_ABI,
    functionName: 'getAccountAddress',
    args: [ownerAddress, 1n],
  });

  return {
    accountFactoryAddress,
    derivedAccountIndex0,
    derivedAccountIndex1,
    matchesIndex0:
      derivedAccountIndex0.toLowerCase() === expectedSmartAccount.toLowerCase(),
    matchesIndex1:
      derivedAccountIndex1.toLowerCase() === expectedSmartAccount.toLowerCase(),
  };
}

/**
 * Get the Ethereal chain config based on chainId.
 */
function getEtherealChain(chainId: number): Chain {
  return chainId === CHAIN_ID_ETHEREAL_TESTNET
    ? etherealTestnetChain
    : etherealChain;
}

// Public clients - Arbitrum is static, Ethereal is created based on chainId
function getArbitrumPublicClient() {
  return createPublicClient({
    transport: httpWithRetry(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'
    ),
    chain: arbitrum,
  });
}

function getEtherealPublicClient(chainId: number) {
  const chain = getEtherealChain(chainId);
  return createPublicClient({
    transport: httpWithRetry(chain.rpcUrls.default.http[0]),
    chain,
  });
}

/**
 * Create a new session with time-limited permissions.
 * Uses ZeroDev's serializePermissionAccount to capture owner's EIP-712 approval.
 * Only creates Ethereal session on login - Arbitrum session is created lazily.
 *
 * @param ownerSigner - The owner's wallet signer
 * @param durationHours - Session duration in hours
 * @param etherealChainId - Which Ethereal chain to use (mainnet or testnet). Defaults to mainnet.
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number,
  etherealChainId: number = DEFAULT_CHAIN_ID,
  onProgress?: (step: SessionCreationStep) => void
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
  // Set validAfter to 0 to avoid clock skew issues between client and blockchain
  // (Ethereal testnet can be 30+ minutes behind real-world time)
  // Security is maintained by validUntil which sets the upper bound
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validUntilInSeconds = nowInSeconds + durationHours * 60 * 60;

  console.debug(
    `[SessionKeyManager] Timestamp policy: validAfter=0, validUntil=${validUntilInSeconds}`
  );

  const timestampPolicy = toTimestampPolicy({
    validAfter: 0,
    validUntil: validUntilInSeconds,
  });

  // Get the selected Ethereal chain and public client
  const selectedEtherealChain = getEtherealChain(etherealChainId);
  const etherealPublicClient = getEtherealPublicClient(etherealChainId);

  // Get contract addresses for the selected chain
  const etherealContracts = getEtherealContractAddresses(etherealChainId);

  console.debug(
    `[SessionKeyManager] Using Ethereal chain: ${selectedEtherealChain.name} (${etherealChainId})`
  );
  console.debug(`[SessionKeyManager] Contract addresses:`, {
    wusde: etherealContracts.wusde,
    predictionMarketEscrow: etherealContracts.predictionMarketEscrow,
    vault: etherealContracts.vault,
  });

  // Note: CallPolicy computes permissionHash from (callType, target, selector) only,
  // NOT including args. So we CANNOT have two permissions for the same target+function.
  // Use ONE_OF condition to allow multiple approved spenders in a single permission.
  const etherealCallPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: etherealContracts.wusde,
        abi: WUSDE_ABI,
        functionName: 'deposit',
        // Allow sending native USDe value for wrapping (up to 1M USDe)
        valueLimit: BigInt(1e24), // 1,000,000 * 1e18
      },
      {
        // Single approve permission using ONE_OF to allow Vault and Escrow
        target: etherealContracts.wusde,
        abi: collateralTokenAbi,
        functionName: 'approve',
        args: [
          {
            condition: ParamCondition.ONE_OF,
            value: [
              etherealContracts.vault,
              etherealContracts.predictionMarketEscrow,
              etherealContracts.secondaryMarketEscrow,
            ].filter(Boolean) as Address[],
          },
          null,
        ],
      },
      // Vault functions for gasless deposits/withdrawals
      {
        target: etherealContracts.vault,
        abi: predictionMarketVaultAbi,
        functionName: 'requestDeposit',
      },
      {
        target: etherealContracts.vault,
        abi: predictionMarketVaultAbi,
        functionName: 'requestWithdrawal',
      },
      {
        target: etherealContracts.vault,
        abi: predictionMarketVaultAbi,
        functionName: 'cancelDeposit',
      },
      {
        target: etherealContracts.vault,
        abi: predictionMarketVaultAbi,
        functionName: 'cancelWithdrawal',
      },
      // Escrow permissions (only if escrow is deployed on this chain)
      ...(etherealContracts.predictionMarketEscrow
        ? [
            {
              target: etherealContracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'mint',
            },
            {
              target: etherealContracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'redeem',
            },
            {
              target: etherealContracts.predictionMarketEscrow,
              abi: predictionMarketEscrowAbi,
              functionName: 'settle',
            },
          ]
        : []),
      // Secondary market escrow permissions (only if deployed)
      ...(etherealContracts.secondaryMarketEscrow
        ? [
            {
              target: etherealContracts.secondaryMarketEscrow,
              abi: secondaryMarketEscrowAbi,
              functionName: 'executeTrade',
            },
          ]
        : []),
    ],
  });

  // Import serialization function
  const { serializePermissionAccount } = await import('@zerodev/permissions');

  // Validate Ethereal bundler/paymaster URLs (will throw if not configured)
  getZeroDevUrls(etherealChainId);

  let etherealEnableTypedData: EnableTypedData | undefined;

  // --- ETHEREAL CHAIN SETUP (required) ---
  console.debug(
    `[SessionKeyManager] Setting up Ethereal session on chain ${etherealChainId}...`
  );

  // Switch to Ethereal chain (only emit progress if chain switch is actually needed)
  const currentChainHex = await withRetry(() =>
    ownerSigner.provider.request({ method: 'eth_chainId' })
  );
  const currentChainId = parseInt(currentChainHex, 16);
  if (currentChainId !== etherealChainId) {
    onProgress?.('switching-network');
    console.debug(
      `[SessionKeyManager] Switching from chain ${currentChainId} to Ethereal chain ${etherealChainId}...`
    );
    await ownerSigner.switchChain(etherealChainId);
  } else {
    console.debug(
      `[SessionKeyManager] Already on Ethereal chain ${etherealChainId}, skipping switch`
    );
  }

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

  // Signature caller policy: allows escrow contracts to call isValidSignature()
  // on the smart account (ERC-1271 verification for session key signatures)
  const signatureCallerPolicy = toSignatureCallerPolicy({
    allowedCallers: [
      etherealContracts.predictionMarketEscrow,
      etherealContracts.secondaryMarketEscrow,
    ].filter(Boolean) as Address[],
  });

  // Create permission plugin for Ethereal with call, timestamp, and signature caller policies
  const etherealPermissionPlugin = await toPermissionValidator(
    etherealPublicClient,
    {
      entryPoint: ENTRY_POINT,
      signer: sessionKeySigner,
      policies: [etherealCallPolicy, timestampPolicy, signatureCallerPolicy],
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
  onProgress?.('requesting-approval');
  console.debug(
    '[SessionKeyManager] Requesting owner approval for Ethereal session key...'
  );
  const etherealApproval = await serializePermissionAccount(
    etherealAccount,
    sessionPrivateKey
  );

  // Create Ethereal client
  const etherealClient = createChainClient(
    selectedEtherealChain,
    etherealAccount
  );

  console.debug('[SessionKeyManager] Owner approval obtained, session created');
  console.debug(
    '[SessionKeyManager] Arbitrum session will be created lazily on first EAS attestation'
  );

  onProgress?.('deploying-account');
  // Deploy the smart account on-chain via a deployment UserOp if not already deployed.
  // This ensures ERC-1271 isValidSignature works on the first mint (the escrow
  // contract checks signer.code.length > 0 before attempting ERC-1271 fallback).
  // We use approve(vault, 0) as the callData because a raw no-op (0x) is not in
  // the session key's CallPolicy and would cause an AA23 paymaster revert.
  const etherealPublicClientForDeploy =
    getEtherealPublicClient(etherealChainId);
  const deployedCode = await etherealPublicClientForDeploy.getCode({
    address: smartAccountAddress,
  });
  if (!deployedCode || deployedCode === '0x') {
    console.debug(
      '[SessionKeyManager] Smart account not deployed, sending deployment UserOp...'
    );
    try {
      const deployStart = Date.now();
      // Send a harmless approve(vault, 0) UserOp — the bundler will include
      // initCode to deploy the smart account as part of this operation.
      // approve(vault, 0) is within the session key's CallPolicy permissions
      // and is effectively a no-op (approving zero amount).
      const deployOpHash = await etherealClient.sendUserOperation({
        callData: await etherealAccount.encodeCalls([
          {
            to: etherealContracts.wusde,
            data: encodeFunctionData({
              abi: collateralTokenAbi,
              functionName: 'approve',
              args: [etherealContracts.vault, BigInt(0)],
            }),
            value: BigInt(0),
          },
        ]),
      });
      console.debug(
        `[SessionKeyManager] Smart account deployment UserOp sent in ${Date.now() - deployStart}ms, hash: ${deployOpHash}`
      );
    } catch (e) {
      console.warn('[SessionKeyManager] Failed to deploy smart account:', e);
      // Non-fatal — session still works with Path B (native session key validation)
    }
  } else {
    console.debug('[SessionKeyManager] Smart account already deployed');
  }

  onProgress?.('finalizing');

  // Sign TRADE_PERMISSION approval for SecondaryMarketEscrow (if deployed).
  // This authorizes the session key to sign TradeApprovals for secondary market trades.
  let tradeSessionKeyApproval: EscrowSessionKeyApproval | undefined;
  if (etherealContracts.secondaryMarketEscrow) {
    try {
      tradeSessionKeyApproval = await _signTradeSessionKeyApproval(
        ownerSigner,
        sessionKeyAccount.address,
        smartAccountAddress,
        validUntilInSeconds,
        etherealChainId,
        etherealContracts.secondaryMarketEscrow
      );
    } catch (e) {
      console.warn(
        '[SessionKeyManager] Failed to sign trade approval (non-fatal):',
        e
      );
      // Non-fatal — secondary market won't work but primary market still does
    }
  }

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
    etherealChainId,
    tradeSessionKeyApproval,
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
  const arbitrumPublicClient = getArbitrumPublicClient();

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

  // Determine which Ethereal chain was used (default to mainnet for backwards compatibility)
  const etherealChainId = serialized.etherealChainId ?? DEFAULT_CHAIN_ID;
  const selectedEtherealChain = getEtherealChain(etherealChainId);
  const etherealPublicClient = getEtherealPublicClient(etherealChainId);
  const arbitrumPublicClient = getArbitrumPublicClient();

  console.debug(
    `[SessionKeyManager] Restoring session for Ethereal chain ${etherealChainId}`
  );

  // Recreate session key signer from stored private key
  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Validate escrow session key approval matches the session key (if present)
  if (serialized.escrowSessionKeyApproval) {
    const derivedAddress = sessionKeyAccount.address.toLowerCase();
    const storedAddress =
      serialized.escrowSessionKeyApproval.sessionKey.toLowerCase();
    if (derivedAddress !== storedAddress) {
      console.error(
        '[SessionKeyManager] Escrow session key mismatch detected!',
        {
          derivedFromPrivateKey: sessionKeyAccount.address,
          storedInEscrowApproval:
            serialized.escrowSessionKeyApproval.sessionKey,
        }
      );
      // Clear the corrupted session and throw - user must create a new session
      clearSession();
      throw new Error(
        'Session key mismatch detected. The stored escrow approval has a different session key. ' +
          'Please create a new session.'
      );
    }
    console.debug('[SessionKeyManager] Escrow session key validation passed');
  }

  // Restore Ethereal session (required)
  getZeroDevUrls(etherealChainId); // Will throw if not configured
  const etherealAccount = await deserializePermissionAccount(
    etherealPublicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner
  );
  const etherealClient = createChainClient(
    selectedEtherealChain,
    etherealAccount
  );
  console.debug('[SessionKeyManager] Ethereal session restored');

  // Ensure the smart account is deployed (may not be if session was created
  // before deployment logic was added, or if the deploy UserOp failed).
  const deployedCode = await etherealPublicClient.getCode({
    address: etherealAccount.address,
  });
  if (!deployedCode || deployedCode === '0x') {
    console.debug(
      '[SessionKeyManager] Smart account not deployed, deploying on restore...'
    );
    try {
      // Use approve(vault, 0) as a harmless call within CallPolicy permissions.
      // A raw no-op (0x) would cause AA23 paymaster revert since it's not in the
      // session key's CallPolicy. The bundler includes initCode to deploy the account.
      const restoreContracts = getEtherealContractAddresses(etherealChainId);
      const deployOpHash = await etherealClient.sendUserOperation({
        callData: await etherealAccount.encodeCalls([
          {
            to: restoreContracts.wusde,
            data: encodeFunctionData({
              abi: collateralTokenAbi,
              functionName: 'approve',
              args: [restoreContracts.vault, BigInt(0)],
            }),
            value: BigInt(0),
          },
        ]),
      });
      console.debug(
        `[SessionKeyManager] Smart account deployed on restore, hash: ${deployOpHash}`
      );
    } catch (e) {
      console.warn(
        '[SessionKeyManager] Failed to deploy smart account on restore:',
        e
      );
    }
  }

  // Restore Arbitrum session (optional - may not exist yet)
  let arbitrumClient: KernelAccountClient | null = null;
  if (serialized.arbitrumApproval) {
    getZeroDevUrls(arbitrum.id); // Will throw if not configured
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
    transport: createZeroDevCompatibleTransport(paymasterUrl),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: createZeroDevCompatibleTransport(bundlerUrl),
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

  // Validate session key consistency before saving
  const derivedAddress = privateKeyToAccount(
    serialized.sessionPrivateKey
  ).address;
  if (serialized.escrowSessionKeyApproval) {
    if (
      derivedAddress.toLowerCase() !==
      serialized.escrowSessionKeyApproval.sessionKey.toLowerCase()
    ) {
      console.error(
        '[SessionKeyManager] CRITICAL: Attempted to save session with mismatched keys!',
        {
          derivedFromPrivateKey: derivedAddress,
          inEscrowApproval: serialized.escrowSessionKeyApproval.sessionKey,
        }
      );
      throw new Error(
        'Cannot save session: session key mismatch between private key and escrow approval'
      );
    }
  }

  console.debug('[SessionKeyManager] Saving session', {
    sessionKeyAddress: derivedAddress,
    smartAccount: serialized.config.smartAccountAddress,
    hasEscrowApproval: !!serialized.escrowSessionKeyApproval,
  });

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
  // Support Ethereal mainnet, Ethereal testnet, and Arbitrum
  let chain: Chain;
  let publicClient;
  if (chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET) {
    chain = getEtherealChain(chainId);
    publicClient = getEtherealPublicClient(chainId);
  } else {
    chain = arbitrum;
    publicClient = getArbitrumPublicClient();
  }

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
