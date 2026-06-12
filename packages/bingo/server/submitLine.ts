// Funds ONE line of a card, synchronously, within a single request: RFQ
// auction against the relayer, on-chain bid validation, predictor signature
// via the player's session key, sponsored UserOp mint. Self-contained — its
// own WebSocket, no shared state — so it can run anywhere, including a
// serverless function. The client drives the 10 lines as 10 requests.

import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
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
import { cardTag } from './draw.js';
import { collateralAddress, escrowAddress, linePicks } from './chain.js';
import { buildLines } from './lines.js';
import { NETWORK_CONFIG, type Network } from './network.js';
import { chainFor } from './session.js';
import type { PoolCondition } from './types.js';

const BID_WAIT_MS = 45_000;

/** The app's anonymous estimate-quoter bot: provides indicative prices for
 *  UI display, deliberately unfunded — its bids can never be filled. Skip
 *  them entirely so timeouts report the truth ("no fillable bids"). */
const ESTIMATE_QUOTER = '0xe02ed37d0458c8999943cbe6d1c9db597f3ee572';
const WS_CONNECT_TIMEOUT_MS = 15_000;
const AUCTION_START_TIMEOUT_MS = 10_000;

const WUSDE_DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

export interface SubmitLineParams {
  network: Network;
  sessionClient: KernelAccountClient;
  smartAccountAddress: Address;
  /** The card's 16 dealt cells, in cell order. */
  cells: readonly PoolCondition[];
  /** Declared sides: bit i set = YES on cell i. */
  yesMask: number;
  /** Per-line predictor collateral in wei (cardPrice / 10). */
  stakePerLineWei: bigint;
  /** Which of the 10 lines to fund (0..9). */
  lineIndex: number;
  /** Which of the player's cards in this pool (0-based). */
  cardIndex: number;
  /** Pool the card belongs to (for the per-card refCode tag). */
  poolId: string;
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
 * Wrap the wUSDe shortfall for this line's stake and ensure the escrow
 * allowance covers it. Approves max so concurrent line requests don't race
 * a shrinking allowance.
 *
 * `nonceKey` gives the prep UserOp its own ERC-4337 2D nonce sequence.
 * Without it, concurrent line requests that all see the same shortfall send
 * byte-identical UserOps on the same sequence and the bundler rejects the
 * clones ("Already known") — only one line survives. The normal flow avoids
 * prep entirely (POST /api/card/submit wraps for the whole card up front);
 * this is the retry/partial fallback.
 */
export async function prepareCollateral(
  network: Network,
  sessionClient: KernelAccountClient,
  smartAccountAddress: Address,
  stakeWei: bigint,
  nonceKey?: bigint,
  ensureSessionOp = false,
): Promise<void> {
  const ESCROW_ADDRESS = escrowAddress(network);
  const COLLATERAL_ADDRESS = collateralAddress(network);
  const chain = chainFor(network);
  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
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
  const shortfall = wusdeBalance < stakeWei ? stakeWei - wusdeBalance : 0n;
  if (shortfall > 0n) {
    if (nativeBalance < shortfall) {
      throw new Error(
        `Insufficient funds: smart account has ${wusdeBalance} wUSDe + ` +
          `${nativeBalance} native, needs ${stakeWei} for this line`,
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
  if (allowance < stakeWei) {
    calls.push({
      to: COLLATERAL_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, (1n << 255n) - 1n],
      }),
      value: 0n,
    });
  }
  if (calls.length === 0) {
    if (!ensureSessionOp) return;
    // Nothing to wrap/approve, but the submit step must still send ONE
    // session op serially: a fresh session key's first op ENABLES the
    // permission on the kernel account, consuming its enable nonce. If we
    // return here, the 10 concurrent line mints all carry enable data and
    // only one survives — the rest revert AA23 InvalidNonce (0x756688fe).
    // A repeated max-approve is an allowed, idempotent way to enable.
    calls.push({
      to: COLLATERAL_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, (1n << 255n) - 1n],
      }),
      value: 0n,
    });
  }

  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');
  const nonce =
    nonceKey == null
      ? undefined
      : await (
          account as unknown as {
            getNonce: (args: { key: bigint }) => Promise<bigint>;
          }
        ).getNonce({ key: nonceKey });
  const opHash = await sessionClient.sendUserOperation({
    callData: await account.encodeCalls(calls),
    ...(nonce == null ? {} : { nonce }),
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

/** Runs the auction + mint for one line. Throws with a user-facing message
 *  on any failure; returns the mint's transaction hash on success. */
export async function submitLine(
  params: SubmitLineParams,
): Promise<{ lineId: string; txHash: string | null }> {
  const {
    network,
    sessionClient,
    smartAccountAddress,
    cells,
    yesMask,
    stakePerLineWei,
    lineIndex,
    cardIndex,
    poolId,
  } = params;
  const chain = chainFor(network);
  const chainId = chain.id;

  if (cells.length !== 16) throw new Error('Need 16 dealt cells');
  const tag = `[line ${poolId}#${cardIndex}/${lineIndex} ${smartAccountAddress.slice(0, 8)}]`;
  const allLines = buildLines();
  const line = allLines[lineIndex];
  if (!line) throw new Error(`lineIndex must be 0..${allLines.length - 1}`);
  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');
  const escrow = escrowAddress(network);
  const collateral = collateralAddress(network);

  // Fallback prep on a per-(card, line) nonce key (collision-safe under
  // concurrent line requests, including across two cards funding at once);
  // usually a no-op because submit prepped the whole card.
  await prepareCollateral(
    network,
    sessionClient,
    smartAccountAddress,
    stakePerLineWei,
    BigInt((cardIndex + 1) * 1000 + 101 + lineIndex),
  );
  const HINT_LARGE = (1n << 255n) - 1n;

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const picksForLine = linePicks(line, cells, yesMask);
  // Permit2-style bitmap nonces — any unused uint256 works.
  const predictorNonce = Number(generateRandomNonce() & 0xffff_ffffn);

  // Pairing: the relayer assigns its own auctionId and broadcasts
  // `auction.started` with our (predictor, predictorNonce).
  let onStarted: ((realId: string) => void) | null = null;
  let onBids: ((bids: FullBid[]) => void) | null = null;
  let onExpired: ((err: Error) => void) | null = null;

  const ws = await createEscrowAuctionWs(NETWORK_CONFIG[network].relayerWsUrl, {
    onAuctionStarted: (details) => {
      if (
        String(details.predictor).toLowerCase() !==
          smartAccountAddress.toLowerCase() ||
        details.predictorNonce !== predictorNonce
      ) {
        return;
      }
      onStarted?.(details.auctionId);
    },
    onAuctionBids: ({ bids }) => {
      if (bids.length > 0) onBids?.(bids as unknown as FullBid[]);
    },
    onAuctionExpired: ({ reason }) => {
      onExpired?.(new Error(`Auction expired: ${reason}`));
    },
    onError: (e) => console.warn(`${tag} WS error:`, e),
  });

  try {
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

    // 1. Build + sign auction intent (canonical pick order everywhere).
    const { payload, canonicalPicks } = await prepareAuctionRFQ({
      picks: picksForLine,
      predictorCollateral: stakePerLineWei,
      predictor: smartAccountAddress,
      chainId,
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

    // 2. Stage the started-waiter, then send auction.start.
    const realIdPromise = new Promise<string>((resolveStart, rejectStart) => {
      const t = setTimeout(
        () =>
          rejectStart(
            new Error(`auction.started not seen for nonce=${predictorNonce}`),
          ),
        AUCTION_START_TIMEOUT_MS,
      );
      onStarted = (realId) => {
        clearTimeout(t);
        resolveStart(realId);
      };
    });

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
    console.log(`${tag} auction started id=${realAuctionId} nonce=${predictorNonce}`);

    // 3. Wait for the first bid that validates on-chain. Fail-closed:
    //    accept `valid`/`unverified`, reject `invalid`.
    const seenSigs = new Set<string>();
    let bidsSeen = 0;
    let bidsRejected = 0;
    const bid = new Promise<BidShape>((resolveBid, rejectBid) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        onBids = null;
        onExpired = null;
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        console.warn(
          `${tag} bid wait timed out after ${BID_WAIT_MS}ms: ` +
            `${bidsSeen} bid(s) seen, ${bidsRejected} failed validation`,
        );
        rejectBid(
          new Error(
            bidsSeen === 0
              ? 'No fillable bids — no funded market maker quoted this line'
              : `${bidsSeen} bid(s) received but none validated on-chain`,
          ),
        );
      }, BID_WAIT_MS);

      onBids = async (incoming) => {
        if (settled) return;
        const fresh = incoming.filter((b) => {
          if (b.counterparty.toLowerCase() === ESTIMATE_QUOTER) return false;
          if (seenSigs.has(b.counterpartySignature)) return false;
          seenSigs.add(b.counterpartySignature);
          return true;
        });
        bidsSeen += fresh.length;
        if (fresh.length > 0) {
          console.log(
            `${tag} ${fresh.length} fresh bid(s) from ` +
              fresh.map((b) => `${b.counterparty}@${b.counterpartyCollateral}`).join(', '),
          );
        }
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
                chainId,
                predictionMarketAddress: escrow,
                collateralTokenAddress: collateral,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                publicClient: publicClient as any,
                failOpen: false,
              },
            );
            console.log(
              `${tag} bid from ${b.counterparty.slice(0, 8)} validation=${result.status}` +
                (result.status === 'invalid' && 'reason' in result
                  ? ` reason=${String((result as { reason?: unknown }).reason)}`
                  : ''),
            );
            if (result.status !== 'valid' && result.status !== 'unverified') {
              bidsRejected += 1;
            }
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
            bidsRejected += 1;
            console.warn(`${tag} validate threw:`, e);
          }
        }
      };

      onExpired = (err) => {
        if (settled) return;
        cleanup();
        rejectBid(err);
      };
    });
    ws.subscribeAuction(realAuctionId);

    const resolved = await bid;

    // 4. Sign predictor MintApproval over the canonical picks.
    const mintTypedData = buildPredictorMintTypedData({
      picks: canonicalPicks,
      predictorCollateral: stakePerLineWei,
      counterpartyCollateral: BigInt(resolved.counterpartyCollateral),
      predictor: smartAccountAddress,
      counterparty: resolved.counterparty,
      predictorNonce: BigInt(predictorNonce),
      predictorDeadline: BigInt(payload.predictorDeadline),
      verifyingContract: escrow,
      chainId,
    });

    const predictorSignature = await sessionClient.signTypedData({
      ...mintTypedData,
      domain: {
        ...mintTypedData.domain,
        chainId: Number(mintTypedData.domain.chainId),
      },
    } as unknown as Parameters<typeof sessionClient.signTypedData>[0]);

    // 5. Build batched calls and send as a UserOp via the session key.
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
        // Attributes this mint to one specific card — see chain.ts
        // lineIsFunded. Replaces the old constant 'bingo' tag.
        refCode: cardTag(poolId, smartAccountAddress, cardIndex),
      },
      predictionMarketAddress: escrow,
      collateralTokenAddress: collateral,
      chainId,
      currentWusdeBalance: HINT_LARGE,
      currentAllowance: HINT_LARGE,
    });

    // ERC-4337 2D nonces: a distinct key per (card, line) gives each mint
    // its own EntryPoint sequence — no AA25 collisions when the client funds
    // several lines (or several cards) concurrently.
    const lineKey = BigInt((cardIndex + 1) * 1000 + lineIndex + 1);
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

    console.log(
      `${tag} funded tx=${receipt.receipt?.transactionHash ?? opHash}`,
    );
    return {
      lineId: line.id,
      txHash: receipt.receipt?.transactionHash ?? null,
    };
  } finally {
    ws.close();
  }
}
