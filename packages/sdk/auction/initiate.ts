/**
 * Auction initiation utilities.
 *
 * - `prepareAuctionRFQ()` — pure payload assembly: canonicalizes picks,
 *   computes deadline, builds and signs EIP-712 typed data, assembles the
 *   AuctionRFQPayload, and self-validates. No WebSocket dependency.
 *   Used by the app (React hook) and as the building block for `initiateAuction`.
 *
 * - `initiateAuction()` — end-to-end convenience: calls `prepareAuctionRFQ()`
 *   then sends via WebSocket and waits for the relayer ack. Requires a
 *   WebSocket environment (browser native or Node.js `ws` package).
 */

import type { Address, Hex } from 'viem';
import type { Pick, PickJson, AuctionRFQPayload } from '../types/escrow';
import {
  canonicalizePicks,
  computePickConfigId,
  jsonToPicks,
  picksToJson,
} from './escrowEncoding';
import { buildAuctionIntentTypedData } from './escrowSigning';
import { validateAuctionRFQ } from './validation';
import { predictionMarketEscrow } from '../contracts';

// ============================================================================
// Types
// ============================================================================

/** Typed data structure passed to the signIntent callback. */
export interface SignableTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<
    string,
    ReadonlyArray<{ readonly name: string; readonly type: string }>
  >;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface PrepareAuctionRFQParams {
  /** Picks for the auction (Pick[] or PickJson[] — both accepted). */
  picks: Pick[] | PickJson[];
  /** Predictor's collateral in wei. */
  predictorCollateral: bigint;
  /** Predictor address (EOA or smart account). */
  predictor: Address;
  /** Chain ID. */
  chainId: number;
  /** Predictor's nonce (unused on-chain nonce for replay protection). */
  nonce: number | bigint;
  /** Callback to sign the EIP-712 AuctionIntent typed data.
   *  The caller controls the signer (EOA wallet, session key, etc.). */
  signIntent: (typedData: SignableTypedData) => Promise<Hex>;
  options?: PrepareAuctionRFQOptions;
}

export interface PrepareAuctionRFQOptions {
  /** Seconds from now until deadline (default 30). */
  deadlineSeconds?: number;
  /** Session key data (base64 JSON) for ZeroDev session key path. */
  sessionKeyData?: string;
  /** Sponsor contract address (address(0) = self-funded). */
  predictorSponsor?: Address;
  /** Opaque data passed to sponsor's fundMint. */
  predictorSponsorData?: Hex;
  /** Skip intent signing (for estimate-only / forecast flows). */
  skipIntentSigning?: boolean;
  /** Override the verifying contract (defaults to predictionMarketEscrow[chainId]). */
  verifyingContract?: Address;
  /** Skip self-validation of assembled payload (default false). */
  skipSelfValidation?: boolean;
  /** Referral code (bytes32). */
  refCode?: Hex;
}

export interface PrepareAuctionRFQResult {
  /** The assembled, optionally signed AuctionRFQPayload ready for WS send. */
  payload: AuctionRFQPayload;
  /** keccak256 hash of the canonical picks array. */
  pickConfigId: Hex;
  /** Picks in canonical order. */
  canonicalPicks: Pick[];
  /** The computed deadline (unix seconds). */
  deadline: number;
}

export interface InitiateAuctionParams extends PrepareAuctionRFQParams {
  /** WebSocket URL for the auction relayer. */
  wsUrl: string;
  /** Ack timeout in ms (default 10_000). */
  timeoutMs?: number;
}

export interface InitiateAuctionResult extends PrepareAuctionRFQResult {
  /** The auction ID assigned by the relayer. */
  auctionId: string;
}

// ============================================================================
// prepareAuctionRFQ — pure payload assembly
// ============================================================================

/**
 * Assemble a signed, validated AuctionRFQPayload from raw inputs.
 *
 * Steps:
 * 1. Canonicalize picks
 * 2. Compute pickConfigId
 * 3. Compute deadline
 * 4. Build EIP-712 AuctionIntent typed data + sign via callback
 * 5. Assemble AuctionRFQPayload
 * 6. Self-validate via validateAuctionRFQ (catches bad input before WS send)
 */
export async function prepareAuctionRFQ(
  params: PrepareAuctionRFQParams
): Promise<PrepareAuctionRFQResult> {
  const {
    picks: rawPicks,
    predictorCollateral,
    predictor,
    chainId,
    nonce,
    signIntent,
    options = {},
  } = params;

  const {
    deadlineSeconds = 30,
    sessionKeyData,
    predictorSponsor,
    predictorSponsorData,
    skipIntentSigning = false,
    verifyingContract: explicitContract,
    skipSelfValidation = false,
    refCode,
  } = options;

  // 1. Normalize to Pick[] and canonicalize
  const normalized = normalizePicks(rawPicks);
  const canonicalPicks = canonicalizePicks(normalized);

  // 2. Compute pickConfigId
  const pickConfigId = computePickConfigId(canonicalPicks);

  // 3. Compute deadline
  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + deadlineSeconds;

  // 4. Resolve verifying contract
  const verifyingContract =
    explicitContract ??
    (predictionMarketEscrow[chainId]?.address as Address | undefined);

  // 5. Assemble payload
  const payload: AuctionRFQPayload = {
    picks: picksToJson(canonicalPicks),
    predictorCollateral: predictorCollateral.toString(),
    predictor,
    predictorNonce: Number(nonce),
    predictorDeadline: deadline,
    chainId,
  };

  if (refCode) {
    payload.refCode = refCode;
  }
  if (predictorSponsor) {
    payload.predictorSponsor = predictorSponsor;
    payload.predictorSponsorData = predictorSponsorData ?? '0x';
  }

  // 6. Sign AuctionIntent (unless skipped)
  if (!skipIntentSigning) {
    if (!verifyingContract) {
      throw new Error(
        `No verifying contract for chainId=${chainId}. ` +
          'Pass options.verifyingContract explicitly.'
      );
    }

    const intentTypedData = buildAuctionIntentTypedData({
      picks: canonicalPicks,
      predictor,
      predictorCollateral,
      predictorNonce: BigInt(nonce),
      predictorDeadline: BigInt(deadline),
      verifyingContract,
      chainId,
    });

    // Normalize domain.chainId to number for signing
    // (viem's getEscrowDomain produces bigint, wagmi/signing libs expect number)
    const signableTypedData: SignableTypedData = {
      domain: {
        name: intentTypedData.domain.name!,
        version: intentTypedData.domain.version!,
        chainId: Number(intentTypedData.domain.chainId),
        verifyingContract: intentTypedData.domain.verifyingContract! as Address,
      },
      types: intentTypedData.types,
      primaryType: intentTypedData.primaryType,
      message: intentTypedData.message as unknown as Record<string, unknown>,
    };

    const intentSignature = await signIntent(signableTypedData);
    payload.intentSignature = intentSignature;

    if (sessionKeyData) {
      payload.predictorSessionKeyData = sessionKeyData;
    }
  }

  // 7. Self-validate assembled payload
  if (!skipSelfValidation && verifyingContract) {
    const result = await validateAuctionRFQ(payload, {
      verifyingContract,
      chainId,
      requireSignature: !skipIntentSigning,
    });

    if (result.status !== 'valid') {
      throw new Error(
        `Auction payload failed self-validation: ${'reason' in result ? result.reason : 'unknown error'}`
      );
    }
  }

  return { payload, pickConfigId, canonicalPicks, deadline };
}

// ============================================================================
// initiateAuction — prepareAuctionRFQ + WS send + ack
// ============================================================================

/**
 * End-to-end auction initiation: assemble payload, open WebSocket, send
 * `auction.start`, and wait for the relayer's ack with the auction ID.
 *
 * Creates a transient WebSocket connection that is closed after the ack.
 * For long-lived connections (e.g. React apps with shared WS clients),
 * use `prepareAuctionRFQ()` directly and manage WS send/ack yourself.
 */
export async function initiateAuction(
  params: InitiateAuctionParams
): Promise<InitiateAuctionResult> {
  const prepared = await prepareAuctionRFQ(params);
  const timeoutMs = params.timeoutMs ?? 10_000;

  // Resolve WebSocket constructor (browser-native or Node.js 'ws' package)
  const WS = await resolveWebSocket();

  return new Promise<InitiateAuctionResult>((resolve, reject) => {
    let settled = false;
    const ws = new WS(params.wsUrl);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        reject(new Error('Auction initiation timed out'));
      }
    }, timeoutMs);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      fn();
    };

    ws.onopen = () => {
      const messageId = crypto.randomUUID();
      ws.send(
        JSON.stringify({
          id: messageId,
          type: 'auction.start',
          payload: { ...prepared.payload, id: messageId },
        })
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const raw =
          typeof event.data === 'string' ? event.data : String(event.data);
        const data = JSON.parse(raw);
        const payload = data?.payload;

        if (payload?.error) {
          settle(() =>
            reject(new Error(`Auction start rejected: ${payload.error}`))
          );
        } else if (payload?.auctionId) {
          settle(() =>
            resolve({
              ...prepared,
              auctionId: payload.auctionId as string,
            })
          );
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onerror = () => {
      settle(() => reject(new Error('WebSocket connection error')));
    };

    ws.onclose = () => {
      settle(() =>
        reject(new Error('WebSocket closed before receiving auction ack'))
      );
    };
  });
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Normalize Pick[] or PickJson[] to Pick[].
 * At runtime these types are structurally identical (Address/Hex are branded
 * strings), so we cast via jsonToPicks for PickJson input.
 */
function normalizePicks(picks: Pick[] | PickJson[]): Pick[] {
  if (picks.length === 0) return [];
  // Both types are structurally identical at runtime. jsonToPicks performs
  // the Address/Hex cast. It's safe to always run through it.
  return jsonToPicks(picks as PickJson[]);
}

/**
 * Resolve the WebSocket constructor for the current environment.
 * Prefers the browser-native WebSocket; falls back to the Node.js `ws` package
 * via dynamic import (avoids top-level import that would break browser bundling).
 */
async function resolveWebSocket(): Promise<{
  new (url: string): WebSocket;
}> {
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).WebSocket === 'function'
  ) {
    return globalThis.WebSocket;
  }

  try {
    // Dynamic import — ws is an optional peer dependency
    const wsModule = await import('ws');
    return (wsModule.default || wsModule) as unknown as {
      new (url: string): WebSocket;
    };
  } catch {
    throw new Error(
      'WebSocket not available. For Node.js, install the "ws" package. ' +
        'For browser environments, use prepareAuctionRFQ() and handle WS directly.'
    );
  }
}
