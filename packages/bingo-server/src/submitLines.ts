// Server-side port of the bingo frontend's submitCard.ts, with one structural
// change: there is no mint sponsor. The player's smart account funds each
// line's predictor collateral itself — the backend wraps/approves up front
// via the session key, then runs the 10 RFQs and mints in parallel.

import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
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
import { etherealTestnetChain } from '@sapience/sdk/constants';
import { env } from './config.js';
import {
  COLLATERAL_ADDRESS,
  ESCROW_ADDRESS,
  lineFunded,
  linePicks,
} from './chain.js';
import { buildLines, type Line } from './lines.js';
import { CHAIN_ID } from './session.js';
import type { LineProgress, LineStatus, PoolCondition } from './types.js';

const BID_WAIT_MS = 25_000;
const WS_CONNECT_TIMEOUT_MS = 15_000;

const WUSDE_DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

export interface SubmitLinesParams {
  sessionClient: KernelAccountClient;
  smartAccountAddress: Address;
  /** The card's 16 dealt cells, in cell order. */
  cells: readonly PoolCondition[];
  /** Declared sides: bit i set = YES on cell i. */
  yesMask: number;
  /** Per-line predictor collateral in wei (cardPrice / 10). */
  stakePerLineWei: bigint;
  /** Journaled funded line ids — lines that were minted at some point, even
   *  if the player has since redeemed (burned) the position. Never re-mint
   *  these. */
  alreadyFundedLineIds?: ReadonlySet<string>;
  onProgress?: (
    lineId: string,
    status: LineStatus,
    extra?: { error?: string; opHash?: string },
  ) => void;
}

export interface SubmitLinesResult {
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

/**
 * One batched UserOp before the lines run: wrap the wUSDe shortfall for
 * `totalWei` and ensure the escrow allowance covers it. Doing this once up
 * front (instead of per line inside prepareMintCalls) avoids 10 parallel
 * mints each racing to wrap/approve the same balance.
 */
async function prepareCollateral(
  sessionClient: KernelAccountClient,
  smartAccountAddress: Address,
  totalWei: bigint,
): Promise<void> {
  if (!ESCROW_ADDRESS || !COLLATERAL_ADDRESS) {
    throw new Error('Escrow/collateral not configured for Ethereal');
  }
  const publicClient = createPublicClient({
    chain: etherealTestnetChain,
    transport: http(etherealTestnetChain.rpcUrls.default.http[0]),
  });
  const [nativeBalance, wusdeBalance, allowance] = await Promise.all([
    publicClient.getBalance({ address: smartAccountAddress }),
    publicClient.readContract({
      address: COLLATERAL_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccountAddress],
    }),
    publicClient.readContract({
      address: COLLATERAL_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [smartAccountAddress, ESCROW_ADDRESS],
    }),
  ]);

  const calls: { to: Address; data: Hex; value: bigint }[] = [];
  const shortfall = wusdeBalance < totalWei ? totalWei - wusdeBalance : 0n;
  if (shortfall > 0n) {
    if (nativeBalance < shortfall) {
      throw new Error(
        `Insufficient funds: smart account has ${wusdeBalance} wUSDe + ` +
          `${nativeBalance} native, needs ${totalWei} total collateral`,
      );
    }
    calls.push({
      to: COLLATERAL_ADDRESS,
      data: encodeFunctionData({
        abi: WUSDE_DEPOSIT_ABI,
        functionName: 'deposit',
      }),
      value: shortfall,
    });
  }
  if (allowance < totalWei) {
    calls.push({
      to: COLLATERAL_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, totalWei],
      }),
      value: 0n,
    });
  }
  if (calls.length === 0) return;

  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');
  const opHash = await sessionClient.sendUserOperation({
    callData: await account.encodeCalls(calls),
  });
  const receipt = await sessionClient.waitForUserOperationReceipt({
    hash: opHash,
  });
  if (!receipt.success) {
    throw new Error(
      `Collateral prep reverted${receipt.reason ? `: ${receipt.reason}` : ''}`,
    );
  }
}

export async function submitLines(
  params: SubmitLinesParams,
): Promise<SubmitLinesResult> {
  const {
    sessionClient,
    smartAccountAddress,
    cells,
    yesMask,
    stakePerLineWei,
    alreadyFundedLineIds,
    onProgress,
  } = params;

  if (cells.length !== 16) throw new Error('Need 16 dealt cells');
  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');
  if (!ESCROW_ADDRESS || !COLLATERAL_ADDRESS) {
    throw new Error('Escrow/collateral not configured for Ethereal');
  }
  const escrowAddress = ESCROW_ADDRESS;
  const collateralAddress = COLLATERAL_ADDRESS;

  const allLines = buildLines();
  const progress: Record<string, LineProgress> = Object.fromEntries(
    allLines.map((l) => [
      l.id,
      { lineId: l.id, status: 'pending' as LineStatus },
    ]),
  );
  const emit = (
    lineId: string,
    status: LineStatus,
    extra?: { error?: string; opHash?: string },
  ) => {
    progress[lineId] = { ...progress[lineId], status, ...extra };
    onProgress?.(lineId, status, extra);
  };

  // Idempotent retry: skip lines that already have a funded position. The
  // journal is unioned with the live balance — a redeemed (burned) position
  // still counts as funded, so a retry can never re-mint and double-charge it.
  const fundedFlags = await Promise.all(
    allLines.map(
      async (l) =>
        (alreadyFundedLineIds?.has(l.id) ?? false) ||
        lineFunded(smartAccountAddress, linePicks(l, cells, yesMask)),
    ),
  );
  const lines = allLines.filter((_, i) => {
    if (fundedFlags[i]) emit(allLines[i].id, 'done');
    return !fundedFlags[i];
  });
  if (lines.length === 0) {
    return { perLine: Object.values(progress), anySuccess: true };
  }

  // Wrap + approve once for everything that's about to mint. After this,
  // per-line prepareMintCalls sees "plenty of balance/allowance" hints so it
  // doesn't add its own wrap/approve calls.
  await prepareCollateral(
    sessionClient,
    smartAccountAddress,
    stakePerLineWei * BigInt(lines.length),
  );
  const HINT_LARGE = (1n << 255n) - 1n;

  const publicClient = createPublicClient({
    chain: etherealTestnetChain,
    transport: http(etherealTestnetChain.rpcUrls.default.http[0]),
  });

  // ---------- shared WebSocket ----------
  // Pairing strategy (same as the old frontend flow): the relayer assigns its
  // own auctionId and broadcasts `auction.started` with our (predictor,
  // predictorNonce), so we pair on those.
  const nonceWaiters = new Map<number, (realId: string) => void>();
  const bidStreamHandlers = new Map<string, (bids: FullBid[]) => void>();
  const expiryWaiters = new Map<string, (err: Error) => void>();

  const ws = await createEscrowAuctionWs(env.RELAYER_WS_URL, {
    onAuctionStarted: (details) => {
      if (
        String(details.predictor).toLowerCase() !==
        smartAccountAddress.toLowerCase()
      ) {
        return;
      }
      const cb = nonceWaiters.get(details.predictorNonce);
      if (!cb) return;
      nonceWaiters.delete(details.predictorNonce);
      cb(details.auctionId);
    },
    onAuctionBids: ({ auctionId, bids }) => {
      const handler = bidStreamHandlers.get(auctionId);
      if (!handler || bids.length === 0) return;
      handler(bids as unknown as FullBid[]);
    },
    onAuctionExpired: ({ auctionId, reason }) => {
      const rejectAuction = expiryWaiters.get(auctionId);
      if (rejectAuction) {
        expiryWaiters.delete(auctionId);
        rejectAuction(new Error(`Auction expired: ${reason}`));
      }
    },
    onError: (e) => console.warn('[submitLines] WS error:', e),
  });

  await new Promise<void>((resolve, reject) => {
    if (ws.isConnected) return resolve();
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (ws.isConnected) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - startedAt > WS_CONNECT_TIMEOUT_MS) {
        clearInterval(id);
        reject(new Error('Relayer WebSocket did not connect'));
      }
    }, 100);
  });

  // ---------- per-line pipeline ----------
  const runLine = async (line: Line, lineIndex: number): Promise<void> => {
    try {
      emit(line.id, 'quoting');

      const picksForLine = linePicks(line, cells, yesMask);
      // Permit2-style bitmap nonces — any unused uint256 works, no ordering
      // needed across the parallel in-flight mints.
      const predictorNonce = Number(generateRandomNonce() & 0xffff_ffffn);

      // 1. Build + sign auction intent (canonical pick order everywhere).
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
        options: {
          deadlineSeconds: 60,
          skipSelfValidation: true,
        },
      });

      // 2. Stage a nonce-keyed waiter for auction.started.
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
      const socket = ws.socket;
      if (!socket) throw new Error('WebSocket missing');
      socket.send(
        JSON.stringify({
          id: sentId,
          type: 'auction.start',
          payload: { ...payload, id: sentId },
        }),
      );

      const realAuctionId = await realIdPromise;

      // 4. Wait for the first bid that validates on-chain. Fail-closed:
      //    accept `valid`/`unverified`, reject `invalid`.
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
              console.warn(`[submitLines] ${line.id} validate threw:`, e);
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

      const resolved = await bid;

      emit(line.id, 'signing');

      // 5. Sign predictor MintApproval over the canonical picks.
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

      // 6. Build batched calls and send as a UserOp via the session key.
      //    Collateral was wrapped/approved up front, so hint large values to
      //    keep prepareMintCalls from adding its own wrap/approve.
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
          refCode: stringToHex('bingo', { size: 32 }),
        },
        predictionMarketAddress: escrowAddress,
        collateralTokenAddress: collateralAddress,
        chainId: CHAIN_ID,
        currentWusdeBalance: HINT_LARGE,
        currentAllowance: HINT_LARGE,
      });

      // ERC-4337 2D nonces: a distinct key per line gives each mint its own
      // EntryPoint sequence — no AA25 collisions across the parallel sends.
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
      console.warn(`[submitLines] line ${line.id} failed:`, e);
      emit(line.id, 'failed', { error: msg });
    }
  };

  await Promise.allSettled(
    lines.map((l) => runLine(l, allLines.indexOf(l))),
  );

  ws.close();

  const perLine = Object.values(progress);
  const anySuccess = perLine.some((p) => p.status === 'done');
  return { perLine, anySuccess };
}
