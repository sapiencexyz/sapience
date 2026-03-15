# Comprehensive Summary: Session Keys in the Sapience Codebase

## Executive Overview

This codebase implements **ERC-4337 Account Abstraction** with **session keys** using **ZeroDev's Kernel V3.1** smart accounts. Session keys allow users to delegate limited, time-bound transaction permissions to a separate cryptographic key, enabling **gasless transactions** without requiring wallet signature approval for each operation.

---

## 1. ERC-4337 Account Abstraction Background

### What is ERC-4337?

ERC-4337 introduces **smart contract wallets** (Smart Accounts) to Ethereum without requiring protocol changes. Key concepts:

| Component         | Description                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Smart Account** | A smart contract that acts as a user's wallet. Can have programmable validation logic.               |
| **UserOperation** | A pseudo-transaction structure that describes an action the smart account should take.               |
| **Bundler**       | An off-chain service that collects UserOperations and submits them on-chain as a single transaction. |
| **Paymaster**     | A smart contract that can sponsor gas fees for UserOperations (enabling gasless transactions).       |
| **EntryPoint**    | A singleton contract (v0.7 used here) that processes UserOperations.                                 |

### Kernel Smart Account

ZeroDev's **Kernel** is an ERC-4337 smart account implementation with a **plugin architecture**:

- **Sudo Validator**: The primary owner validator (full control)
- **Regular Validator**: Secondary validators with restricted permissions (session keys use this)

---

## 2. Session Key Architecture

### Core Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              User's Wallet (EOA)                          │
│                           (Owner - Full Control)                          │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  │ Signs EIP-712 "Enable" message
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Kernel Smart Account                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Sudo Validator: ECDSA Validator (Owner's EOA)                      │ │
│  │  - Full control over the account                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Regular Validator: Permission Validator (Session Key)              │ │
│  │  - ECDSA Signer: Generated private key stored in browser            │ │
│  │  - Policies:                                                         │ │
│  │    • Call Policy: Restricts callable functions                      │ │
│  │    • Timestamp Policy: Enforces time bounds                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ UserOperations
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            ZeroDev Infrastructure                         │
│  ┌─────────────────────┐    ┌────────────────────────┐                   │
│  │  Bundler            │    │  Paymaster             │                   │
│  │  - Bundles UserOps  │    │  - Sponsors gas fees   │                   │
│  │  - Submits to chain │    │  - Enables gasless tx  │                   │
│  └─────────────────────┘    └────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File                                                            | Purpose                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `packages/app/src/lib/session/sessionKeyManager.ts`             | Core session creation, restoration, and client management |
| `packages/app/src/lib/context/SessionContext.tsx`               | React context provider for session state across the app   |
| `packages/relayer/src/sessionAuth.ts`                           | Server-side session approval verification                 |
| `packages/relayer/src/smartAccount.ts`                          | Computes deterministic smart account addresses            |
| `packages/relayer/src/auctionSigVerify.ts`                      | Verifies auction signatures with session key support      |
| `packages/app/src/hooks/blockchain/useSapienceWriteContract.ts` | Hook for contract writes with session key routing         |

---

## 3. Session Creation Flow

### Step-by-Step Process

1. **Generate Session Private Key**

   ```typescript
   const sessionPrivateKey = generatePrivateKey();
   const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
   ```

2. **Create Session Signer**

   ```typescript
   const sessionKeySigner = await toECDSASigner({
     signer: sessionKeyAccount,
   });
   ```

3. **Define Policies**

   - **Call Policy**: Restricts which contracts/functions can be called
   - **Timestamp Policy**: Enforces `validAfter` and `validUntil` bounds

4. **Create Permission Validator**

   ```typescript
   const permissionPlugin = await toPermissionValidator(publicClient, {
     entryPoint: ENTRY_POINT,
     signer: sessionKeySigner,
     policies: [callPolicy, timestampPolicy],
     kernelVersion: KERNEL_V3_1,
     permissionId: uniquePermissionId,
   });
   ```

5. **Create Kernel Account with Plugins**

   ```typescript
   const account = await createKernelAccount(publicClient, {
     entryPoint: ENTRY_POINT,
     plugins: {
       sudo: ownerValidator, // Full owner control
       regular: permissionPlugin, // Session key with restrictions
     },
     kernelVersion: KERNEL_V3_1,
   });
   ```

6. **Serialize and Sign**

   - Triggers EIP-712 signature from owner
   - Serializes account state for restoration

   ```typescript
   const approval = await serializePermissionAccount(
     account,
     sessionPrivateKey
   );
   ```

7. **Store in localStorage**
   - Session private key
   - Session key address
   - Approval strings (per chain)
   - EIP-712 typed data (for relayer verification)

---

## 4. Permission Policies

### Call Policy

Defines exactly which contract functions the session key can call:

**Ethereal Chain Permissions:**

```typescript
const etherealCallPolicy = toCallPolicy({
  policyVersion: CallPolicyVersion.V0_0_4,
  permissions: [
    { target: WUSDE_ADDRESS, abi: WUSDE_ABI, functionName: 'deposit' },
    {
      target: WUSDE_ADDRESS,
      abi: collateralTokenAbi,
      functionName: 'approve',
      args: [
        { condition: ParamCondition.ONE_OF, value: [PREDICTION_MARKET, VAULT] },
        null, // Any amount
      ],
    },
    {
      target: PREDICTION_MARKET,
      abi: predictionMarketEscrowAbi,
      functionName: 'mint',
    },
    {
      target: PREDICTION_MARKET,
      abi: predictionMarketEscrowAbi,
      functionName: 'burn',
    },
    {
      target: PREDICTION_MARKET,
      abi: predictionMarketEscrowAbi,
      functionName: 'consolidatePrediction',
    },
  ],
});
```

**Arbitrum Chain Permissions:**

```typescript
const arbitrumCallPolicy = toCallPolicy({
  policyVersion: CallPolicyVersion.V0_0_4,
  permissions: [{ target: EAS_ARBITRUM, abi: EAS_ABI, functionName: 'attest' }],
});
```

### Timestamp Policy

Enforces time-based validity:

```typescript
const timestampPolicy = toTimestampPolicy({
  validAfter: nowInSeconds, // Unix timestamp - session starts now
  validUntil: nowInSeconds + duration, // Unix timestamp - session expires after duration
});
```

### Parameter Conditions

The call policy supports parameter constraints:

- `ParamCondition.ONE_OF`: Argument must be one of specified values
- `null`: Any value allowed for that argument

---

## 5. Multi-Chain Support

### Chain Architecture

| Chain                  | Purpose                                | Session Creation                    |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| **Ethereal (5064014)** | Primary chain for predictions/auctions | Created immediately on login        |
| **Arbitrum (42161)**   | EAS attestations                       | Created lazily on first attestation |

### Lazy Session Creation

Arbitrum sessions are created on-demand to avoid unnecessary signature requests:

```typescript
async function createArbitrumSessionIfNeeded() {
  if (arbitrumSessionApproval || chainClients.arbitrum) {
    return chainClients.arbitrum; // Already exists
  }

  // Create new Arbitrum session using existing session private key
  const result = await createArbitrumSession(
    ownerSigner,
    existingSessionPrivateKey,
    sessionConfig.expiresAt
  );

  // Save and return
  saveSession(updatedSerialized);
  return result.arbitrumClient;
}
```

---

## 6. Session Restoration

Sessions persist across page reloads via localStorage:

```typescript
async function restoreSession(
  serialized: SerializedSession
): Promise<SessionResult> {
  // Check expiration
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }

  // Recreate session signer
  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  // Restore account from approval string
  const account = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner
  );

  // Create client
  return createChainClient(chain, account);
}
```

---

## 7. Transaction Execution

### Session Key Path (Gasless)

When a session is active, transactions bypass the user's wallet:

```typescript
async function executeViaSessionKey(sessionClient, calls, chainId) {
  // 1. Encode calls
  const encodedCalls = await sessionClient.account.encodeCalls(calls);

  // 2. Send UserOperation
  const userOpHash = await sessionClient.sendUserOperation({
    callData: encodedCalls,
  });

  // 3. Wait for receipt
  const receipt = await sessionClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt.receipt.transactionHash;
}
```

### Gas Sponsorship

The ZeroDev paymaster sponsors gas fees:

```typescript
const paymasterClient = createZeroDevPaymasterClient({
  chain,
  transport: http(paymasterUrl),
});

const client = createKernelAccountClient({
  account,
  chain,
  bundlerTransport: http(bundlerUrl),
  paymaster: {
    getPaymasterData: async (userOperation) => {
      return paymasterClient.sponsorUserOperation({ userOperation });
    },
  },
});
```

---

## 8. Relayer Authentication

### Security Model

The relayer verifies session approvals to authenticate requests:

1. **Parse Approval**: Extract `enableSignature`, `accountAddress`, `validatorData`
2. **Verify EIP-712 Signature**: Recover signer from enable signature
3. **Compute Smart Account**: Derive expected smart account from recovered owner
4. **Match Addresses**: Verify computed address matches claimed address
5. **Extract Session Key**: Get session key from signed `validatorData`
6. **Verify Request Signature**: Confirm request was signed by the session key

```typescript
async function verifySessionApproval(approval, claimedAccountAddress) {
  // Recover owner from EIP-712 signature
  const recoveredOwner = await recoverTypedDataAddress({
    ...typedDataForVerification,
    signature: parsed.enableSignature,
  });

  // Compute expected smart account
  const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner);

  // Verify match
  if (expectedSmartAccount !== parsed.accountAddress) {
    return { valid: false, error: 'owner_mismatch' };
  }

  // Extract session key from cryptographically signed data
  const sessionKeyAddress = extractSessionKeyFromValidatorData(
    approval.typedData.message.validatorData
  );

  return { valid: true, ownerAddress: recoveredOwner, sessionKeyAddress };
}
```

### EIP-712 Enable Typed Data

The enable signature binds the session key to the smart account:

```typescript
interface EnableTypedData {
  domain: {
    name: string; // "Kernel"
    version: string; // "0.3.1"
    chainId: number; // Chain ID
    verifyingContract: Address; // Smart account address
  };
  types: {
    Enable: [
      { name: 'validationId'; type: 'bytes21' },
      { name: 'nonce'; type: 'uint32' },
      { name: 'hook'; type: 'address' },
      { name: 'validatorData'; type: 'bytes' },
      { name: 'hookData'; type: 'bytes' },
      { name: 'selectorData'; type: 'bytes' },
    ];
  };
  primaryType: 'Enable';
  message: {
    validationId: Hex; // Identifies the permission validator
    nonce: number; // Prevents replay attacks
    hook: Address; // Optional hook contract
    validatorData: Hex; // Contains policies + session key
    hookData: Hex; // Hook configuration
    selectorData: Hex; // Function selector restrictions
  };
}
```

---

## 9. Data Storage

### SerializedSession Structure

```typescript
interface SerializedSession {
  config: {
    durationHours: number;
    expiresAt: number; // Unix timestamp (ms)
    ownerAddress: Address; // EOA that owns the smart account
    smartAccountAddress: Address; // Kernel smart account
  };
  sessionPrivateKey: Hex; // ECDSA private key (stored locally only)
  sessionKeyAddress: Address; // Public address of session key
  createdAt: number;
  etherealApproval: string; // Base64 ZeroDev approval (required)
  arbitrumApproval?: string; // Base64 ZeroDev approval (lazy)
  etherealEnableTypedData?: EnableTypedData;
  arbitrumEnableTypedData?: EnableTypedData;
}
```

### Transport Security

Before sending to relayer, private key is stripped:

```typescript
function extractApprovalForTransport(serializedApproval: string) {
  const params = JSON.parse(atob(serializedApproval));

  // Remove sensitive data
  const safeParams = {
    enableSignature: params.enableSignature,
    accountParams: params.accountParams,
    permissionParams: stripAbisFromPolicies(params.permissionParams),
    action: params.action,
    kernelVersion: params.kernelVersion,
    validatorData: params.validatorData,
    hookData: params.hookData,
    // Explicitly excluded: privateKey
  };

  return btoa(JSON.stringify(safeParams));
}
```

---

## 10. React Integration

### SessionContext API

```typescript
interface SessionContextValue {
  // State
  isSessionActive: boolean;
  sessionConfig: SessionConfig | null;
  chainClients: {
    ethereal: KernelAccountClient | null;
    arbitrum: KernelAccountClient | null;
  };

  // Actions
  startSession: (params: { durationHours: number }) => Promise<void>;
  endSession: () => void;
  createArbitrumSessionIfNeeded: () => Promise<KernelAccountClient | null>;

  // Status
  isStartingSession: boolean;
  isRestoringSession: boolean;
  sessionError: Error | null;
  timeRemainingMs: number;

  // Smart Account
  smartAccountAddress: Address | null;
  isCalculatingAddress: boolean;

  // Signing (for UserOperations)
  signMessage: ((message: string) => Promise<Hex>) | null;
  signTypedData: ((params: SignTypedDataParams) => Promise<Hex>) | null;
  sessionKeyAddress: Address | null;

  // Relayer Authentication
  etherealSessionApproval: SessionApprovalData | null;
  arbitrumSessionApproval: SessionApprovalData | null;

  // Lazy Creation
  hasArbitrumSession: boolean;
  isCreatingArbitrumSession: boolean;
}
```

### Automatic Session Management

- **Restore on mount**: Checks localStorage for existing session
- **Wallet mismatch detection**: Clears session if wallet changes
- **Expiration tracking**: Updates `timeRemainingMs` every second
- **Auto-cleanup**: Clears session on expiration or wallet disconnect

---

## 11. Configuration

### Environment Variables

```bash
# ZeroDev Project ID (from dashboard)
NEXT_PUBLIC_ZERODEV_PROJECT_ID=your_project_id

# Custom bundler/paymaster URLs (optional, defaults to ZeroDev hosted)
NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ETHEREAL=https://custom-bundler.example.com
NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ETHEREAL=https://custom-paymaster.example.com
NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ARBITRUM=https://custom-bundler.example.com
NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ARBITRUM=https://custom-paymaster.example.com

# RPC URLs
NEXT_PUBLIC_RPC_URL=https://arb1.arbitrum.io/rpc
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc  # Server-side
```

---

## 12. Security Considerations

| Aspect                     | Implementation                                             |
| -------------------------- | ---------------------------------------------------------- |
| **Session Key Storage**    | Private key stored only in browser localStorage            |
| **Permission Scoping**     | Call policy restricts to specific contracts/functions      |
| **Time Bounding**          | Timestamp policy enforces expiration                       |
| **Signature Verification** | EIP-712 domain binding prevents cross-account attacks      |
| **Session Key Extraction** | Extracted from signed `validatorData`, not client-provided |
| **Transport Security**     | Private key stripped before sending to relayer             |
| **Unique Permission IDs**  | Hash of session key + timestamp prevents collision         |

---

## 13. ZeroDev SDK Dependencies

```json
{
  "@zerodev/sdk": "5.5.7", // Core smart account creation
  "@zerodev/ecdsa-validator": "5.4.9", // ECDSA signature validators
  "@zerodev/permissions": "5.6.3", // Permission validators and policies
  "@zerodev/hooks": "5.3.4" // React hooks (app package)
}
```

---

## Summary

This implementation provides a complete session key system that:

1. **Generates ephemeral ECDSA keys** that can sign transactions on behalf of a smart account
2. **Restricts permissions** to specific contract calls and time windows
3. **Enables gasless transactions** via ZeroDev's bundler and paymaster
4. **Supports multiple chains** with lazy session creation for secondary chains
5. **Persists sessions** across page reloads via localStorage
6. **Authenticates with the relayer** using cryptographic proofs
