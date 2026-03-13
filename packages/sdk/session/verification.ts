import {
  recoverTypedDataAddress,
  decodeAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { computeSmartAccountAddress } from './smartAccount';

// ValidatorData structure constants
const FLAG_BYTES = 2;
const SIGNER_CONTRACT_BYTES = 20;
const ADDRESS_BYTES = 20;
const HEX_PREFIX_LENGTH = 2; // '0x'
const MIN_SIGNER_PART_LENGTH =
  HEX_PREFIX_LENGTH + (FLAG_BYTES + SIGNER_CONTRACT_BYTES + ADDRESS_BYTES) * 2; // 86

/**
 * Extracts the session key address from ZeroDev's validatorData.
 *
 * ZeroDev encodes validatorData as ABI-encoded bytes[] where the last element
 * contains: flag (2 bytes) + signerContractAddress (20 bytes) + signerData
 * For ECDSA signers, signerData is the session key address (20 bytes).
 *
 * @param validatorData - The hex-encoded validatorData from the Enable typed data
 * @returns The session key address, or null if extraction fails
 */
export function extractSessionKeyFromValidatorData(
  validatorData: Hex
): Address | null {
  try {
    const [policyAndSignerData] = decodeAbiParameters(
      [{ name: 'policyAndSignerData', type: 'bytes[]' }],
      validatorData
    );

    if (!policyAndSignerData || policyAndSignerData.length === 0) {
      console.warn('[SessionAuth] Empty policyAndSignerData in validatorData');
      return null;
    }

    // Last element contains signer info
    const signerPart = policyAndSignerData[policyAndSignerData.length - 1];

    if (signerPart.length < MIN_SIGNER_PART_LENGTH) {
      console.warn(
        '[SessionAuth] Signer part too short to contain session key'
      );
      return null;
    }

    // Extract session key address: skip flag + signerContract
    const sessionKeyStartHex =
      HEX_PREFIX_LENGTH + (FLAG_BYTES + SIGNER_CONTRACT_BYTES) * 2; // 46
    const sessionKeyEndHex = sessionKeyStartHex + ADDRESS_BYTES * 2; // 86
    const sessionKeyHex =
      '0x' + signerPart.slice(sessionKeyStartHex, sessionKeyEndHex);

    return sessionKeyHex.toLowerCase() as Address;
  } catch (error) {
    console.error(
      '[SessionAuth] Failed to extract session key from validatorData:',
      error
    );
    return null;
  }
}

/**
 * Parsed ZeroDev approval data for verification.
 */
export interface ParsedApproval {
  enableSignature: Hex;
  accountAddress: Address;
  permissionId: Hex;
  action: {
    selector: Hex;
    address: Address;
    hook?: { address: Address };
  };
  kernelVersion?: string;
  validatorData?: Hex;
  hookData?: Hex;
}

/**
 * Parses a ZeroDev serialized permission account.
 * Returns null if parsing fails.
 */
export function parseZeroDevApproval(
  serializedApproval: string
): ParsedApproval | null {
  try {
    // ZeroDev uses base64-encoded JSON
    const jsonString = Buffer.from(serializedApproval, 'base64').toString(
      'utf-8'
    );
    const params = JSON.parse(jsonString);

    if (!params.enableSignature || !params.accountParams?.accountAddress) {
      console.warn(
        '[SessionAuth] Missing enableSignature or accountAddress in approval'
      );
      return null;
    }

    return {
      enableSignature: params.enableSignature as Hex,
      accountAddress: params.accountParams.accountAddress as Address,
      permissionId: params.permissionParams?.permissionId || '0x00000000',
      action: params.action || {
        selector: '0x00000000' as Hex,
        address: zeroAddress,
      },
      kernelVersion: params.kernelVersion,
      validatorData: params.validatorData as Hex | undefined,
      hookData: params.hookData as Hex | undefined,
    };
  } catch (error) {
    console.error('[SessionAuth] Failed to parse approval:', error);
    return null;
  }
}

/**
 * EIP-712 typed data captured during session creation.
 * When provided, this is used directly for signature verification instead of reconstruction.
 */
export interface EnableTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    Enable: readonly { name: string; type: string }[];
  };
  primaryType: 'Enable';
  message: {
    validationId: string;
    nonce: number;
    hook: string;
    validatorData: string;
    hookData: string;
    selectorData: string;
  };
}

/**
 * Session approval data that clients send for authentication.
 */
export interface SessionApprovalPayload {
  // The ZeroDev serialized permission account (base64, private key stripped)
  approval: string;
  // Chain ID for verification
  chainId: number;
  // Optional: EIP-712 typed data captured during session creation
  // When provided, this is used directly for verification (more reliable)
  typedData?: EnableTypedData;
}

/**
 * Verifies a session approval using the ZeroDev enable signature.
 *
 * Security model:
 * 1. Parse the approval to extract enableSignature and accountAddress
 * 2. The enableSignature is EIP-712 signed with verifyingContract = accountAddress
 * 3. Recover the owner from the signature using provided or reconstructed typed data
 * 4. Compute the smart account from the owner
 * 5. Verify it matches the claimed accountAddress
 * 6. Extract the authorized session key from the signed validatorData
 *
 * This ensures:
 * - The signature is bound to the specific accountAddress (EIP-712 domain)
 * - Only the owner could have created this signature
 * - The accountAddress is legitimately controlled by the recovered owner
 * - The session key is extracted from cryptographically signed data (not client-provided)
 *
 * @param approval - The session approval payload (includes optional typedData)
 * @param claimedAccountAddress - The account address claimed in the request
 * @returns Verification result with owner address and session key address if valid
 */
export async function verifySessionApproval(
  approval: SessionApprovalPayload,
  claimedAccountAddress: Address
): Promise<{
  valid: boolean;
  ownerAddress?: Address;
  sessionKeyAddress?: Address;
  error?: string;
}> {
  try {
    // Parse the ZeroDev approval
    const parsed = parseZeroDevApproval(approval.approval);
    if (!parsed) {
      return { valid: false, error: 'invalid_approval_format' };
    }

    // Verify the account address matches
    if (
      parsed.accountAddress.toLowerCase() !==
      claimedAccountAddress.toLowerCase()
    ) {
      console.warn('[SessionAuth] Account address mismatch:', {
        approval: parsed.accountAddress,
        claimed: claimedAccountAddress,
      });
      return { valid: false, error: 'account_mismatch' };
    }

    // Verify enable signature exists
    if (!parsed.enableSignature || parsed.enableSignature === '0x') {
      return { valid: false, error: 'missing_enable_signature' };
    }

    // SECURITY: Typed data is required for session-based authentication.
    // Without the original typed data captured during session creation,
    // we cannot reliably verify the enable signature.
    if (!approval.typedData) {
      console.warn(
        '[SessionAuth] Typed data required for session authentication'
      );
      return { valid: false, error: 'typed_data_required' };
    }

    // Validate chain ID consistency
    if (approval.chainId !== approval.typedData.domain.chainId) {
      console.warn('[SessionAuth] Chain ID mismatch:', {
        payloadChainId: approval.chainId,
        typedDataChainId: approval.typedData.domain.chainId,
      });
      return { valid: false, error: 'chain_id_mismatch' };
    }

    // Validate verifyingContract matches the claimed account address
    if (
      approval.typedData.domain.verifyingContract.toLowerCase() !==
      claimedAccountAddress.toLowerCase()
    ) {
      console.warn('[SessionAuth] Verifying contract mismatch:', {
        verifyingContract: approval.typedData.domain.verifyingContract,
        claimedAccount: claimedAccountAddress,
      });
      return { valid: false, error: 'verifying_contract_mismatch' };
    }

    const typedDataForVerification = {
      domain: {
        name: approval.typedData.domain.name,
        version: approval.typedData.domain.version,
        chainId: approval.typedData.domain.chainId,
        verifyingContract: approval.typedData.domain
          .verifyingContract as Address,
      },
      types: {
        Enable: [...approval.typedData.types.Enable] as {
          name: string;
          type: string;
        }[],
      },
      primaryType: approval.typedData.primaryType,
      message: {
        validationId: approval.typedData.message.validationId as Hex,
        nonce: approval.typedData.message.nonce,
        hook: approval.typedData.message.hook as Address,
        validatorData: approval.typedData.message.validatorData as Hex,
        hookData: approval.typedData.message.hookData as Hex,
        selectorData: approval.typedData.message.selectorData as Hex,
      },
    };

    try {
      // Recover the owner EOA that signed the enable typed data
      // This proves someone authorized this session key for the verifyingContract (smart account)
      const recoveredOwner = await recoverTypedDataAddress({
        ...typedDataForVerification,
        signature: parsed.enableSignature,
      });

      // Extract the authorized session key from the signed validatorData
      // This is cryptographically bound to the enable signature, so we trust it
      const sessionKeyAddress = extractSessionKeyFromValidatorData(
        approval.typedData.message.validatorData as Hex
      );

      if (!sessionKeyAddress) {
        console.warn(
          '[SessionAuth] Failed to extract session key from validatorData'
        );
        return { valid: false, error: 'invalid_validator_data' };
      }

      // Verify the recovered owner actually owns the claimed smart account.
      // EIP-712 domain binding alone is insufficient — any EOA can sign with
      // verifyingContract set to an arbitrary address. We must derive the
      // expected smart account from the recovered owner and compare.
      const expectedSmartAccount = computeSmartAccountAddress(recoveredOwner);
      if (
        expectedSmartAccount.toLowerCase() !==
        claimedAccountAddress.toLowerCase()
      ) {
        console.warn('[SessionAuth] Smart account ownership mismatch:', {
          recoveredOwner,
          expectedSmartAccount,
          claimedAccountAddress,
        });
        return { valid: false, error: 'smart_account_ownership_mismatch' };
      }

      return { valid: true, ownerAddress: recoveredOwner, sessionKeyAddress };
    } catch (sigError) {
      // SECURITY: Always fail closed on signature verification errors.
      // Never fall back to accepting unverified approvals.
      console.error('[SessionAuth] Signature verification failed:', sigError);
      return { valid: false, error: 'invalid_signature' };
    }
  } catch (error) {
    console.error('[SessionAuth] Verification failed:', error);
    return { valid: false, error: 'verification_failed' };
  }
}

/**
 * Extracts just the essential fields from a ZeroDev approval for API transport.
 * This removes the session private key to avoid exposure.
 */
export function extractApprovalForTransport(
  serializedApproval: string
): string | null {
  try {
    const jsonString = Buffer.from(serializedApproval, 'base64').toString(
      'utf-8'
    );
    const params = JSON.parse(jsonString);

    // Remove the private key before transport
    const safeParams = {
      enableSignature: params.enableSignature,
      accountParams: params.accountParams,
      permissionParams: params.permissionParams,
      action: params.action,
      kernelVersion: params.kernelVersion,
      validatorData: params.validatorData,
      hookData: params.hookData,
      // Explicitly exclude: privateKey, eip7702Auth
    };

    const safeJsonString = JSON.stringify(safeParams);
    return Buffer.from(safeJsonString).toString('base64');
  } catch {
    return null;
  }
}
