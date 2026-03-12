import type { Address, Hex } from 'viem';
import { verifyTypedData, zeroAddress } from 'viem';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import {
  buildCounterpartyMintTypedData,
  buildPredictorMintTypedData,
} from '@sapience/sdk/auction/escrowSigning';
import {
  buildSimulationStateOverride,
  parseSimulationError,
} from '@sapience/sdk/auction/simulate';
import type { SimulateBidResult } from '@sapience/sdk/auction/simulate';
import { isNonceUsed, generateRandomNonce } from '@sapience/sdk/onchain/escrow';
import { validateCounterpartyFunds } from '@sapience/sdk/onchain/position';
import type { Pick } from '@sapience/sdk/types';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

export type { SimulateBidResult };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SimulateEscrowBidOptions {
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  predictorAddress: Address;
  predictorCollateral: string; // wei
  picks: Pick[];
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
  /** Session mode: non-interactive signing for simulation-only predictor approval */
  signPredictorApproval: (params: {
    domain: {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: Address;
    };
    types: Record<
      string,
      readonly { readonly name: string; readonly type: string }[]
    >;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
}

export interface ValidateEscrowBidLightweightOptions {
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
}

// ─── Session mode: Full simulation ──────────────────────────────────────────

/**
 * Validates an escrow bid by simulating the full PredictionMarketEscrow.mint() call.
 *
 * Session mode only — requires a non-interactive signing function for the
 * predictor's MintApproval (used only for simulation, not for actual submission).
 *
 * On RPC/network errors (not contract reverts), treats bid as valid (same as V1).
 */
export async function simulateEscrowBidMint(
  bid: QuoteBid,
  options: SimulateEscrowBidOptions
): Promise<SimulateBidResult> {
  const {
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picks,
    predictorSponsor = zeroAddress,
    predictorSponsorData = '0x' as Hex,
    signPredictorApproval,
  } = options;

  const predictorCollateralWei = BigInt(predictorCollateral);
  const counterpartyCollateralWei = BigInt(bid.counterpartyCollateral);
  const counterparty = bid.counterparty as Address;

  // Generate a fresh nonce and deadline for simulation-only predictor signature
  const predictorNonce = generateRandomNonce();
  const predictorDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  logBidValidation(
    `[escrow-sim] Simulating bid from ${counterparty.slice(0, 10)}... predictorCollateral=${predictorCollateral}, counterpartyCollateral=${bid.counterpartyCollateral}`
  );

  try {
    // 1. Build predictor's MintApproval typed data
    const typedData = buildPredictorMintTypedData({
      picks,
      predictorCollateral: predictorCollateralWei,
      counterpartyCollateral: counterpartyCollateralWei,
      predictor: predictorAddress,
      counterparty,
      predictorNonce,
      predictorDeadline,
      predictorSponsor,
      predictorSponsorData,
      verifyingContract: predictionMarketAddress,
      chainId,
    });

    // 2. Sign via session key (non-interactive)
    const predictorSignature = await signPredictorApproval({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    // 3. Build the full escrow MintRequest struct (matching position.ts:232-253)
    const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;
    const mintRequest = {
      picks: picks.map((p) => ({
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
      predictorCollateral: predictorCollateralWei,
      counterpartyCollateral: counterpartyCollateralWei,
      predictor: predictorAddress,
      counterparty,
      predictorNonce,
      counterpartyNonce: BigInt(bid.counterpartyNonce),
      predictorDeadline,
      counterpartyDeadline: BigInt(bid.counterpartyDeadline),
      predictorSignature,
      counterpartySignature: bid.counterpartySignature as Hex,
      refCode: ZERO_BYTES32,
      predictorSessionKeyData: '0x' as Hex,
      counterpartySessionKeyData: (bid.counterpartySessionKeyData ||
        '0x') as Hex,
      predictorSponsor,
      predictorSponsorData,
    };

    // 4. Build state overrides for BOTH predictor and counterparty
    const predictorOverrides = buildSimulationStateOverride({
      simulationAddress: predictorAddress,
      collateralTokenAddress,
      predictionMarketAddress,
      makerCollateralWei: predictorCollateralWei,
    });

    const counterpartyOverrides = buildSimulationStateOverride({
      simulationAddress: counterparty,
      collateralTokenAddress,
      predictionMarketAddress,
      makerCollateralWei: counterpartyCollateralWei,
    });

    // Merge: deduplicate by address, merge stateDiff arrays for collateral token
    const stateOverride = mergeStateOverrides(
      predictorOverrides,
      counterpartyOverrides
    );

    // 5. Simulate the mint call
    const publicClient = getPublicClientForChainId(chainId);
    await publicClient.simulateContract({
      address: predictionMarketAddress,
      abi: predictionMarketEscrowAbi,
      functionName: 'mint',
      args: [mintRequest],
      account: predictorAddress,
      stateOverride,
    });

    return { isValid: true };
  } catch (err: unknown) {
    // Distinguish contract reverts from RPC/network errors
    if (isContractRevert(err)) {
      const errorMessage = parseSimulationError(err);

      // InvalidSignature is expected for the PREDICTOR in session mode:
      // simulateContract can't replicate the smart account's ERC-1271 context.
      // But it could also mean the COUNTERPARTY signature is wrong (real bug).
      // Verify the counterparty sig off-chain first — only fall back to
      // lightweight validation if the counterparty sig is actually valid.
      const rawMessage = err instanceof Error ? err.message : '';
      const isInvalidSignature =
        rawMessage.includes('InvalidSignature') ||
        (errorMessage.includes('Invalid') &&
          errorMessage.includes('signature'));
      if (isInvalidSignature) {
        // Verify counterparty signature off-chain (EOA ecrecover)
        let counterpartySigValid = false;
        try {
          const counterpartyTypedData = buildCounterpartyMintTypedData({
            picks,
            predictorCollateral: predictorCollateralWei,
            counterpartyCollateral: counterpartyCollateralWei,
            predictor: predictorAddress,
            counterparty,
            counterpartyNonce: BigInt(bid.counterpartyNonce),
            counterpartyDeadline: BigInt(bid.counterpartyDeadline),
            predictorSponsor,
            predictorSponsorData,
            verifyingContract: predictionMarketAddress,
            chainId,
          });
          counterpartySigValid = await verifyTypedData({
            address: counterparty,
            domain: {
              ...counterpartyTypedData.domain,
              chainId: Number(counterpartyTypedData.domain.chainId),
            },
            types: counterpartyTypedData.types,
            primaryType: counterpartyTypedData.primaryType,
            message: counterpartyTypedData.message,
            signature: bid.counterpartySignature as Hex,
          });
        } catch {
          // If counterparty uses a smart account (ERC-1271), ecrecover won't
          // work — check session key data presence as a heuristic.
          counterpartySigValid = !!bid.counterpartySessionKeyData;
        }

        if (!counterpartySigValid) {
          logBidValidation(
            `[escrow-sim] InvalidSignature — counterparty sig verification failed for ${bid.counterparty.slice(0, 10)}`
          );
          return { isValid: false, error: 'Counterparty signature is invalid' };
        }

        logBidValidation(
          `[escrow-sim] InvalidSignature (expected in session mode, counterparty sig OK) — falling back to lightweight validation for ${bid.counterparty.slice(0, 10)}`
        );
        return validateEscrowBidLightweight(bid, {
          chainId,
          predictionMarketAddress,
          collateralTokenAddress,
        });
      }

      console.debug('=== ESCROW BID SIMULATION ERROR ===');
      console.debug('Bid counterparty:', bid.counterparty);
      console.debug('Error:', err);
      console.debug('=== END ERROR ===');

      return { isValid: false, error: errorMessage };
    }

    // RPC/network error — treat bid as valid (same pattern as V1)
    logBidValidationWarn(
      '[escrow-sim] RPC/network error, treating bid as valid:',
      bid.counterparty.slice(0, 10),
      err
    );
    return { isValid: true };
  }
}

// ─── EOA mode: Lightweight validation ───────────────────────────────────────

/**
 * Validates an escrow bid using lightweight on-chain checks (no simulation).
 *
 * EOA mode — when session signing is unavailable.
 * Checks: deadline expiry, nonce usage, balance/allowance.
 *
 * On RPC errors, treats bid as valid to avoid blocking users.
 */
export async function validateEscrowBidLightweight(
  bid: QuoteBid,
  options: ValidateEscrowBidLightweightOptions
): Promise<SimulateBidResult> {
  const { chainId, predictionMarketAddress, collateralTokenAddress } = options;

  const counterparty = bid.counterparty as Address;
  const counterpartyCollateralWei = BigInt(bid.counterpartyCollateral);

  // 1. Check deadline expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (bid.counterpartyDeadline <= nowSec) {
    logBidValidation(
      `[escrow-lightweight] Bid from ${counterparty.slice(0, 10)}... expired (deadline=${bid.counterpartyDeadline}, now=${nowSec})`
    );
    return { isValid: false, error: 'Bid has expired' };
  }

  try {
    // 2. Check counterparty nonce
    const nonceUsed = await isNonceUsed(
      counterparty,
      BigInt(bid.counterpartyNonce),
      { chainId, marketAddress: predictionMarketAddress }
    );
    if (nonceUsed) {
      logBidValidation(
        `[escrow-lightweight] Bid from ${counterparty.slice(0, 10)}... nonce already used (nonce=${bid.counterpartyNonce})`
      );
      return { isValid: false, error: 'Bidder nonce is stale' };
    }

    // 3. Check counterparty balance/allowance
    const publicClient = getPublicClientForChainId(chainId);
    await validateCounterpartyFunds(
      counterparty,
      counterpartyCollateralWei,
      collateralTokenAddress,
      predictionMarketAddress,
      publicClient
    );

    return { isValid: true };
  } catch (err) {
    // validateCounterpartyFunds throws with 'market maker' message on insufficient funds
    if (err instanceof Error && err.message.includes('market maker')) {
      logBidValidation(
        `[escrow-lightweight] Bid from ${counterparty.slice(0, 10)}... insufficient funds`
      );
      return { isValid: false, error: err.message };
    }

    // RPC/network error — treat as valid
    logBidValidationWarn(
      '[escrow-lightweight] RPC error, treating bid as valid:',
      counterparty.slice(0, 10),
      err
    );
    return { isValid: true };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StateOverrideEntry = {
  address: `0x${string}`;
  balance?: bigint;
  stateDiff?: Array<{ slot: `0x${string}`; value: `0x${string}` }>;
};

/**
 * Merge two state override arrays, combining stateDiff entries for
 * the same address (the collateral token will appear in both).
 */
function mergeStateOverrides(
  a: StateOverrideEntry[],
  b: StateOverrideEntry[]
): StateOverrideEntry[] {
  const map = new Map<string, StateOverrideEntry>();

  for (const entry of [...a, ...b]) {
    const key = entry.address.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      // Merge: keep higher balance, concat stateDiff
      existing.balance =
        existing.balance && entry.balance
          ? existing.balance > entry.balance
            ? existing.balance
            : entry.balance
          : existing.balance || entry.balance;
      if (entry.stateDiff) {
        existing.stateDiff = [
          ...(existing.stateDiff || []),
          ...entry.stateDiff,
        ];
      }
    } else {
      map.set(key, { ...entry });
    }
  }

  return Array.from(map.values());
}

/**
 * Check if an error is a contract revert (vs RPC/network error).
 *
 * Viem throws typed error classes with a `name` property for contract reverts.
 * We check `name` first (reliable), then fall back to message keywords.
 */
function isContractRevert(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Viem error class names (set via BaseError)
  const name = (err as { name?: string }).name ?? '';
  if (
    name === 'ContractFunctionExecutionError' ||
    name === 'ContractFunctionRevertedError' ||
    name === 'ContractFunctionZeroDataError'
  ) {
    return true;
  }

  // Fallback: check message for revert keywords
  const msg = err.message;
  return msg.includes('execution reverted') || msg.includes('revert');
}
