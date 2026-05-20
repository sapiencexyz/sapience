import {
  createPublicClient,
  http,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import type { KernelAccountClient } from '@zerodev/sdk';
import {
  generateRandomNonce,
  prepareMintCalls,
  buildPredictorMintTypedData,
} from '@sapience/sdk';
import { prepareAuctionRFQ } from '@sapience/sdk/auction/initiate';
import { validateBidOnChain } from '@sapience/sdk/auction/validation';
import { createEscrowAuctionWs } from '@sapience/sdk/relayer/escrowAuctionWs';
import { CHAIN_ID_ETHEREAL, etherealChain } from '@sapience/sdk/constants';
import {
  predictionMarketEscrow as escrowAddresses,
  collateralToken as collateralAddresses,
} from '@sapience/sdk/contracts';
import type { Pick } from '@sapience/sdk/types/escrow';
import { buildLines, type Line } from '~/parlay';
import type { BingoCondition } from '~/api';
import type { Side } from '~/screens/CardScreen';

const RELAYER_WS_URL = 'wss://relayer.sapience.xyz/auction';
const CHAIN_ID = CHAIN_ID_ETHEREAL;
const BID_WAIT_MS = 25_000;

export type LineStatus =
  | 'pending'
  | 'quoting'
  | 'signing'
  | 'submitting'
  | 'done'
  | 'failed';

export interface LineProgress {
  lineId: string;
  status: LineStatus;
  error?: string;
  /** UserOperation hash, set once the mint is submitted. */
  opHash?: string;
}

export interface SubmitCardParams {
  sessionClient: KernelAccountClient;
  smartAccountAddress: Address;
  conditions: BingoCondition[]; // length 16
  picks: Side[]; // length 16
  /** Per-line predictor collateral in wei. tier/10 in human units. */
  stakePerLineWei: bigint;
  onProgress?: (
    lineId: string,
    status: LineStatus,
    extra?: { error?: string; opHash?: string },
  ) => void;
}

export interface SubmitCardResult {
  perLine: LineProgress[];
  anySuccess: boolean;
}

interface BidShape {
  counterparty: Address;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: Hex;
  counterpartySessionKeyData?: string;
}

function linePicks(
  line: Line,
  conditions: BingoCondition[],
  picks: Side[],
): Pick[] {
  return line.cellIndices.map((i) => ({
    conditionResolver: conditions[i].resolver,
    conditionId: conditions[i].id as Hex,
    predictedOutcome: picks[i] === 'YES' ? 1 : 0,
  }));
}

export async function submitCard(
  params: SubmitCardParams,
): Promise<SubmitCardResult> {
  const {
    sessionClient,
    smartAccountAddress,
    conditions,
    picks,
    stakePerLineWei,
    onProgress,
  } = params;

  if (conditions.length !== 16) throw new Error('Need 16 conditions');
  if (picks.length !== 16) throw new Error('Need 16 picks');

  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');

  const escrowAddress = escrowAddresses[CHAIN_ID]?.address as
    | Address
    | undefined;
  const collateralAddress = collateralAddresses[CHAIN_ID]?.address as
    | Address
    | undefined;
  if (!escrowAddress || !collateralAddress) {
    throw new Error('Escrow/collateral not configured for Ethereal');
  }

  // SessionScreen.prepareAccount has already wrapped the full tier and
  // approved the escrow for it, so each per-line mint just calls
  // `escrow.mint(...)` — no wrap, no approve. We pass artificially-high
  // balance + allowance hints so prepareMintCalls skips those calls.
  const HINT_LARGE = (1n << 255n) - 1n;
  const currentWusdeBalance = HINT_LARGE;
  const currentAllowance = HINT_LARGE;

  const lines = buildLines();
  const progress: Record<string, LineProgress> = Object.fromEntries(
    lines.map((l) => [l.id, { lineId: l.id, status: 'pending' as LineStatus }]),
  );
  const emit = (
    lineId: string,
    status: LineStatus,
    extra?: { error?: string; opHash?: string },
  ) => {
    progress[lineId] = { ...progress[lineId], status, ...extra };
    onProgress?.(lineId, status, extra);
  };

  // Public client for on-chain bid validation. The SDK expects its own
  // PublicClient type from a different abitype transitive; we cast at the
  // call site below since these are runtime-compatible.
  const publicClient = createPublicClient({
    chain: etherealChain,
    transport: http(etherealChain.rpcUrls.default.http[0]),
  });

  // ---------- shared WebSocket ----------
  // Pairing strategy:
  //   The relayer assigns its own auctionId and broadcasts `auction.started`
  //   with our (predictor, predictorNonce), so we pair on those.
  //   nonceWaiters[predictorNonce] → fires with the relayer's auctionId
  //   bidStreamHandlers[realAuctionId] → handler that receives all incoming
  //     bids for that auction; the line's runLine sets this up post-pairing
  //     so it has the per-line context (picks etc.) needed by SDK's
  //     validateBidOnChain. Same approach as app's useValidatedBids.
  const nonceWaiters = new Map<number, (realId: string) => void>();
  const bidStreamHandlers = new Map<string, (bids: FullBid[]) => void>();
  const expiryWaiters = new Map<string, (err: Error) => void>();

  interface FullBid {
    auctionId: string;
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
    counterpartySignature: string;
    counterpartySessionKeyData?: string;
    receivedAt: string;
  }

  const ws = await createEscrowAuctionWs(RELAYER_WS_URL, {
    onAuctionStarted: (details) => {
      const ourPredictor = smartAccountAddress.toLowerCase();
      const broadcastPredictor = String(details.predictor).toLowerCase();
      if (broadcastPredictor !== ourPredictor) return;
      const cb = nonceWaiters.get(details.predictorNonce);
      if (!cb) return;
      console.log(
        `[submitCard] auction.started nonce=${details.predictorNonce} id=${details.auctionId}`,
      );
      nonceWaiters.delete(details.predictorNonce);
      cb(details.auctionId);
    },
    onAuctionBids: ({ auctionId, bids }) => {
      const handler = bidStreamHandlers.get(auctionId);
      if (!handler || bids.length === 0) return;
      handler(bids as unknown as FullBid[]);
    },
    onAuctionExpired: ({ auctionId, reason }) => {
      console.log(`[submitCard] auction.expired id=${auctionId} reason=${reason}`);
      const rejectAuction = expiryWaiters.get(auctionId);
      if (rejectAuction) {
        expiryWaiters.delete(auctionId);
        rejectAuction(new Error(`Auction expired: ${reason}`));
      }
    },
    onError: (e) => console.warn('[submitCard] WS error:', e),
  });

  // Wait until WS is open
  await new Promise<void>((resolve, reject) => {
    if (ws.isConnected) return resolve();
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (ws.isConnected) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - startedAt > 10_000) {
        clearInterval(id);
        reject(new Error('WebSocket did not connect within 10s'));
      }
    }, 100);
  });

  // ---------- per-line pipeline ----------
  const runLine = async (line: Line, lineIndex: number): Promise<void> => {
    try {
      emit(line.id, 'quoting');

      const picksForLine = linePicks(line, conditions, picks);
      // PredictionMarketEscrow uses Permit2-style bitmap nonces — unordered,
      // any unused uint256 works. A random nonce per line is fine; we don't
      // need to coordinate ordering across the 10 in-flight mints.
      const predictorNonce = Number(generateRandomNonce() & 0xffff_ffffn);

      // 1. Build + sign auction intent. canonicalPicks is the keccak-sorted
      //    order — the contract rejects mints whose picks aren't canonical
      //    (PicksNotCanonical) so we use these everywhere downstream.
      const { payload, canonicalPicks } = await prepareAuctionRFQ({
        picks: picksForLine,
        predictorCollateral: stakePerLineWei,
        predictor: smartAccountAddress,
        chainId: CHAIN_ID,
        nonce: predictorNonce,
        signIntent: async (typedData) =>
          sessionClient.signTypedData(
            typedData as Parameters<typeof sessionClient.signTypedData>[0],
          ),
        options: { deadlineSeconds: 60, skipSelfValidation: true },
      });

      // 2. Stage a nonce-keyed waiter — fires when the relayer broadcasts
      //    `auction.started` with our predictor + predictorNonce.
      const realIdPromise = new Promise<string>((resolveStart, rejectStart) => {
        const t = setTimeout(() => {
          nonceWaiters.delete(predictorNonce);
          rejectStart(
            new Error(`auction.started not seen for nonce=${predictorNonce}`),
          );
        }, 10_000);
        nonceWaiters.set(predictorNonce, (realId) => {
          clearTimeout(t);
          resolveStart(realId);
        });
      });

      // 3. Send auction.start
      const sentId = crypto.randomUUID();
      console.log(
        `[submitCard] line=${line.id} sending auction.start sentId=${sentId} nonce=${predictorNonce}`,
      );
      const socket = ws.socket;
      if (!socket) throw new Error('WebSocket missing');
      socket.send(
        JSON.stringify({
          id: sentId,
          type: 'auction.start',
          payload: { ...payload, id: sentId },
        }),
      );

      // 4. Resolve real auctionId
      const realAuctionId = await realIdPromise;
      console.log(`[submitCard] line=${line.id} got realId=${realAuctionId}`);

      // 5. Validate incoming bids via SDK's validateBidOnChain. Same
      //    fail-closed semantics as the app's useValidatedBids: accept
      //    `valid` or `unverified`, reject `invalid`. Skip duplicates by
      //    counterpartySignature so a noisy relayer rebroadcast doesn't
      //    re-validate the same bid every push.
      const seenSigs = new Set<string>();
      const bid = new Promise<BidShape>((resolveBid, rejectBid) => {
        let settled = false;
        const cleanup = () => {
          settled = true;
          clearTimeout(timer);
          bidStreamHandlers.delete(realAuctionId);
          expiryWaiters.delete(realAuctionId);
        };
        const timer = setTimeout(() => {
          if (settled) return;
          cleanup();
          rejectBid(new Error('No valid bid received within timeout'));
        }, BID_WAIT_MS);

        bidStreamHandlers.set(realAuctionId, async (incoming) => {
          if (settled) return;
          const fresh = incoming.filter((b) => {
            if (seenSigs.has(b.counterpartySignature)) return false;
            seenSigs.add(b.counterpartySignature);
            return true;
          });
          if (fresh.length === 0) return;

          console.log(
            `[submitCard] line=${line.id} validating ${fresh.length} fresh bid(s)`,
          );
          for (const b of fresh) {
            if (settled) return;
            try {
              const result = await validateBidOnChain(
                {
                  counterparty: b.counterparty,
                  counterpartyCollateral: b.counterpartyCollateral,
                  counterpartyNonce: b.counterpartyNonce,
                  counterpartyDeadline: b.counterpartyDeadline,
                  counterpartySignature: b.counterpartySignature,
                  counterpartySessionKeyData: b.counterpartySessionKeyData,
                },
                {
                  predictor: smartAccountAddress,
                  predictorCollateral: stakePerLineWei.toString(),
                  predictorNonce,
                  picks: canonicalPicks.map((p) => ({
                    conditionResolver: p.conditionResolver,
                    conditionId: p.conditionId,
                    predictedOutcome: p.predictedOutcome,
                  })),
                },
                {
                  chainId: CHAIN_ID,
                  predictionMarketAddress: escrowAddress,
                  collateralTokenAddress: collateralAddress,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  publicClient: publicClient as any,
                  failOpen: false,
                },
              );
              console.log(
                `[submitCard] line=${line.id} bid from ${b.counterparty.slice(0, 10)} → ${result.status}`,
              );
              if (result.status === 'valid' || result.status === 'unverified') {
                if (settled) return;
                cleanup();
                resolveBid({
                  counterparty: b.counterparty as Address,
                  counterpartyCollateral: b.counterpartyCollateral,
                  counterpartyNonce: b.counterpartyNonce,
                  counterpartyDeadline: b.counterpartyDeadline,
                  counterpartySignature: b.counterpartySignature as Hex,
                  counterpartySessionKeyData: b.counterpartySessionKeyData,
                });
                return;
              }
            } catch (e) {
              console.warn(`[submitCard] line=${line.id} validate threw:`, e);
            }
          }
        });

        expiryWaiters.set(realAuctionId, (err) => {
          if (settled) return;
          cleanup();
          rejectBid(err);
        });
      });
      ws.subscribeAuction(realAuctionId);

      // 6. Wait for first valid bid
      const resolved = await bid;
      console.log(`[submitCard] line=${line.id} got bid from ${resolved.counterparty}`);

      emit(line.id, 'signing');

      // 6. Sign predictor MintApproval — over the canonical picks
      const mintTypedData = buildPredictorMintTypedData({
        picks: canonicalPicks,
        predictorCollateral: stakePerLineWei,
        counterpartyCollateral: BigInt(resolved.counterpartyCollateral),
        predictor: smartAccountAddress,
        counterparty: resolved.counterparty,
        predictorNonce: BigInt(predictorNonce),
        predictorDeadline: BigInt(payload.predictorDeadline),
        verifyingContract: escrowAddress,
        chainId: CHAIN_ID,
      });

      const predictorSignature = await sessionClient.signTypedData({
        ...mintTypedData,
        domain: {
          ...mintTypedData.domain,
          chainId: Number(mintTypedData.domain.chainId),
        },
      } as unknown as Parameters<typeof sessionClient.signTypedData>[0]);

      emit(line.id, 'submitting');

      // 7. Build batched calls and send as UserOp via session client
      const calls = prepareMintCalls({
        mintData: {
          picks: canonicalPicks.map((p) => ({
            conditionResolver: p.conditionResolver,
            conditionId: p.conditionId,
            predictedOutcome: p.predictedOutcome,
          })),
          predictorCollateral: stakePerLineWei.toString(),
          counterpartyCollateral: resolved.counterpartyCollateral,
          predictor: smartAccountAddress,
          counterparty: resolved.counterparty,
          predictorNonce,
          predictorDeadline: payload.predictorDeadline,
          counterpartyDeadline: resolved.counterpartyDeadline,
          predictorSignature,
          counterpartySignature: resolved.counterpartySignature as Hex,
          counterpartyClaimedNonce: resolved.counterpartyNonce,
          predictorSessionKeyData: payload.predictorSessionKeyData,
          counterpartySessionKeyData: resolved.counterpartySessionKeyData,
          // "bingo" tagged as the affiliate code, right-padded to bytes32
          refCode: stringToHex('bingo', { size: 32 }),
        },
        predictionMarketAddress: escrowAddress,
        collateralTokenAddress: collateralAddress,
        chainId: CHAIN_ID,
        currentWusdeBalance,
        currentAllowance,
      });

      // ERC-4337 2D nonces, properly. ZeroDev Kernel's account.getNonce({ key })
      // mixes our user-supplied key with the validator/permission identifier
      // and returns the *resolved* uint256 nonce from EntryPoint.getNonce().
      // We pass that resolved nonce to sendUserOperation so the signer signs
      // over it (signature stays valid) AND each line gets its own independent
      // sequence at the EntryPoint (no AA25 collisions across parallel sends).
      const lineKey = BigInt(lineIndex + 1);
      const nonce = await (
        account as unknown as {
          getNonce: (args: { key: bigint }) => Promise<bigint>;
        }
      ).getNonce({ key: lineKey });

      const opHash = await sessionClient.sendUserOperation({
        callData: await account.encodeCalls(calls),
        nonce,
      });

      // Wait for inclusion so we surface on-chain reverts (paymaster reject,
      // session-policy mismatch, escrow signature reject) instead of marking
      // the line "done" while the position never actually minted.
      const receipt = await sessionClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      if (!receipt.success) {
        const txHash = receipt.receipt?.transactionHash;
        const detail = receipt.reason
          ? `: ${receipt.reason}`
          : txHash
            ? ` (tx ${txHash})`
            : '';
        throw new Error(`Mint reverted on-chain${detail}`);
      }

      emit(line.id, 'done', { opHash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[submitCard] line ${line.id} failed:`, e);
      emit(line.id, 'failed', { error: msg });
    }
  };

  await Promise.allSettled(lines.map((l, i) => runLine(l, i)));

  ws.close();

  const perLine = Object.values(progress);
  const anySuccess = perLine.some((p) => p.status === 'done');
  return { perLine, anySuccess };
}
