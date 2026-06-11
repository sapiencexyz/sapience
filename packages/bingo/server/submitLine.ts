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
  linePicks,
} from './chain.js';
import { buildLines } from './lines.js';
import { CHAIN_ID } from './session.js';
import type { PoolCondition } from './types.js';

const BID_WAIT_MS = 25_000;
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
 */
async function prepareCollateral(
  sessionClient: KernelAccountClient,
  smartAccountAddress: Address,
  stakeWei: bigint,
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

/** Runs the auction + mint for one line. Throws with a user-facing message
 *  on any failure; returns the mint's transaction hash on success. */
export async function submitLine(
  params: SubmitLineParams,
): Promise<{ lineId: string; txHash: string | null }> {
  const {
    sessionClient,
    smartAccountAddress,
    cells,
    yesMask,
    stakePerLineWei,
    lineIndex,
  } = params;

  if (cells.length !== 16) throw new Error('Need 16 dealt cells');
  const allLines = buildLines();
  const line = allLines[lineIndex];
  if (!line) throw new Error(`lineIndex must be 0..${allLines.length - 1}`);
  const account = sessionClient.account;
  if (!account) throw new Error('Session client has no account');
  if (!ESCROW_ADDRESS || !COLLATERAL_ADDRESS) {
    throw new Error('Escrow/collateral not configured for Ethereal');
  }
  const escrowAddress = ESCROW_ADDRESS;
  const collateralAddress = COLLATERAL_ADDRESS;

  await prepareCollateral(sessionClient, smartAccountAddress, stakePerLineWei);
  const HINT_LARGE = (1n << 255n) - 1n;

  const publicClient = createPublicClient({
    chain: etherealTestnetChain,
    transport: http(etherealTestnetChain.rpcUrls.default.http[0]),
  });

  const picksForLine = linePicks(line, cells, yesMask);
  // Permit2-style bitmap nonces — any unused uint256 works.
  const predictorNonce = Number(generateRandomNonce() & 0xffff_ffffn);

  // Pairing: the relayer assigns its own auctionId and broadcasts
  // `auction.started` with our (predictor, predictorNonce).
  let onStarted: ((realId: string) => void) | null = null;
  let onBids: ((bids: FullBid[]) => void) | null = null;
  let onExpired: ((err: Error) => void) | null = null;

  const ws = await createEscrowAuctionWs(env.RELAYER_WS_URL, {
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
    onError: (e) => console.warn('[submitLine] WS error:', e),
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

    // 3. Wait for the first bid that validates on-chain. Fail-closed:
    //    accept `valid`/`unverified`, reject `invalid`.
    const seenSigs = new Set<string>();
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
        rejectBid(new Error('No valid bid received within timeout'));
      }, BID_WAIT_MS);

      onBids = async (incoming) => {
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
            console.warn(`[submitLine] ${line.id} validate threw:`, e);
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
        refCode: stringToHex('bingo', { size: 32 }),
      },
      predictionMarketAddress: escrowAddress,
      collateralTokenAddress: collateralAddress,
      chainId: CHAIN_ID,
      currentWusdeBalance: HINT_LARGE,
      currentAllowance: HINT_LARGE,
    });

    // ERC-4337 2D nonces: a distinct key per line gives each mint its own
    // EntryPoint sequence — no AA25 collisions when the client funds several
    // lines concurrently.
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

    return {
      lineId: line.id,
      txHash: receipt.receipt?.transactionHash ?? null,
    };
  } finally {
    ws.close();
  }
}
