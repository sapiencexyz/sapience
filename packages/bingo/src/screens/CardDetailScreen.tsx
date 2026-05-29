import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseAbi, type Address, type Hex } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import { OutcomeSide, type Pick } from '@sapience/sdk/types/escrow';
import { predictionMarketEscrow as escrowAddresses } from '@sapience/sdk/contracts';
import {
  useAccount,
  useConnect,
  usePublicClient,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import {
  BINGO_CARD_ABI,
  CHAIN_ID,
  fmtUnits,
  loadContractAddress,
  shortAddress,
  STATIC_ENTROPY_ABI,
} from '../lib/bingoCard';
import {
  setCellSidesViaSession,
  claimBonusViaSession,
  withdrawUnusedViaSession,
  redeemViaSession,
} from '../lib/session/sessionKeyManager';
import { useSession } from '../hooks/useSession';
import { useSubmitCard } from '../hooks/useSubmitCard';
import { buildLines } from '../parlay';
import { fetchConditionsByIds, type BingoConditionDetail } from '../api';
import Nav from '../components/Nav';

interface CardSnapshot {
  player: Address;
  refCode: Hex;
  poolVersion: number;
  mintedAt: bigint;
  expiresAt: bigint;
  sponsorBalance: bigint;
  cardPriceAtMint: bigint;
  referralBpsAtMint: number;
  revealed: boolean;
  referrerPaid: boolean;
  sidesDeclared: boolean;
  filledLineBitmap: number;
  cellSides: number;
  conditionIds: readonly Hex[];
  resolvers: readonly Address[];
}

interface BonusPreview {
  wins: number;
  payout: bigint;
}

interface Props {
  cardId: bigint;
}

const LINES = buildLines();

/** Where each line's status square sits around the 4×4 grid:
 *  rows on the right edge, cols along the bottom, diagonals in the corners. */
const LINE_POS: Record<string, { gridColumn: number; gridRow: number }> = (() => {
  const m: Record<string, { gridColumn: number; gridRow: number }> = {};
  for (let r = 0; r < 4; r++) m[`row-${r}`] = { gridColumn: 6, gridRow: r + 1 };
  for (let c = 0; c < 4; c++) m[`col-${c}`] = { gridColumn: c + 2, gridRow: 5 };
  m['diag-tr-bl'] = { gridColumn: 1, gridRow: 5 };
  m['diag-tl-br'] = { gridColumn: 6, gridRow: 5 };
  return m;
})();

const ESCROW_PICKCONFIG_ABI = parseAbi([
  'function getPickConfiguration(bytes32 pickConfigId) view returns ((bytes32 pickConfigId, uint256 totalPredictorCollateral, uint256 totalCounterpartyCollateral, uint256 claimedPredictorCollateral, uint256 claimedCounterpartyCollateral, bool resolved, uint8 result))',
]);

const RESOLVER_ABI = parseAbi([
  'function getResolution(bytes conditionId) view returns (bool isResolved, (uint256 yesWeight, uint256 noWeight) outcome)',
]);

const ESCROW_TOKENPAIR_ABI = parseAbi([
  'function getTokenPair(bytes32 pickConfigId) view returns ((address predictorToken, address counterpartyToken))',
]);

const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

type CellStatus = 'pending' | 'correct' | 'wrong';

/** loading / check / x icon for a cell's resolution status. */
function CellStatusIcon({ status }: { status: CellStatus }) {
  if (status === 'correct') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === 'wrong') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  // pending → static clock/timer (not animated)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function fmtEndTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Gross payout if a line hits = the whole prediction pool (stake + counterparty). */
function fmtWin(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

function lineStatusLabel(status: string): string {
  switch (status) {
    case 'quoting':
      return 'QUOTING…';
    case 'signing':
      return 'SIGNING…';
    case 'submitting':
      return 'MINTING…';
    case 'failed':
      return 'FAILED';
    default:
      return 'WAITING';
  }
}

export default function CardDetailScreen({ cardId }: Props) {
  const { isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  const {
    client: sessionClient,
    isActive,
    isStarting,
    isRestoring,
    config,
    start,
  } = useSession();
  const smartAccount = config?.smartAccountAddress;

  const contractAddress: Address | null = useMemo(() => {
    const a = loadContractAddress();
    return a && isAddress(a) ? (a as Address) : null;
  }, []);
  const baseContract = contractAddress
    ? { address: contractAddress, abi: BINGO_CARD_ABI, chainId: CHAIN_ID }
    : null;

  const [card, setCard] = useState<CardSnapshot | null>(null);
  const [preview, setPreview] = useState<BonusPreview | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [conditionDetails, setConditionDetails] = useState<
    Map<string, BingoConditionDetail>
  >(new Map());

  const [pickedSides, setPickedSides] = useState(0);
  const [pickedMask, setPickedMask] = useState(0);
  const allCellsPicked = (pickedMask & 0xffff) === 0xffff;

  // Bumped after each action to force an immediate card re-read.
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tip, setTip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  // Real per-line outcome read from the escrow by recomputing each funded
  // line's pickConfigId. Idempotent across reloads. pool = stake + counterparty.
  interface LineOutcome {
    pool: bigint;
    resolved: boolean;
    predictorWon: boolean;
    claimed: boolean;
  }
  const [lineOutcomes, setLineOutcomes] = useState<Record<string, LineOutcome>>(
    {},
  );
  // Per-cell resolution vs the declared side, once the card is complete.
  const [cellStatus, setCellStatus] = useState<Record<number, CellStatus>>({});

  const submitter = useSubmitCard();

  // ---------- entropy: detect mock + drive the reveal ----------
  // Real Pyth reveals async via a keeper; the StaticEntropy mock used on
  // staging needs someone to push the callback. pushCallback is permissionless,
  // so the player can trigger their own reveal right here.
  const [entropyAddr, setEntropyAddr] = useState<Address | null>(null);
  const [isMockEntropy, setIsMockEntropy] = useState(false);
  const [pendingSeq, setPendingSeq] = useState<bigint | null>(null);
  const { writeContract: writeReveal, isPending: revealPending } =
    useWriteContract();

  useEffect(() => {
    if (!publicClient || !contractAddress) return;
    let stop = false;
    void (async () => {
      try {
        const ent = (await publicClient.readContract({
          address: contractAddress,
          abi: BINGO_CARD_ABI,
          functionName: 'entropy',
        })) as Address;
        if (stop) return;
        setEntropyAddr(ent);
        // Capability probe: only StaticEntropy exposes fixedRandom().
        try {
          await publicClient.readContract({
            address: ent,
            abi: STATIC_ENTROPY_ABI,
            functionName: 'fixedRandom',
          });
          if (!stop) setIsMockEntropy(true);
        } catch {
          if (!stop) setIsMockEntropy(false);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, contractAddress]);

  // Find the pending entropy sequence for this card (cleared on reveal).
  useEffect(() => {
    if (
      !publicClient ||
      !contractAddress ||
      !entropyAddr ||
      !card ||
      card.revealed
    ) {
      setPendingSeq(null);
      return;
    }
    let stop = false;
    void (async () => {
      try {
        const nextSeq = (await publicClient.readContract({
          address: entropyAddr,
          abi: STATIC_ENTROPY_ABI,
          functionName: 'nextSequence',
        })) as bigint;
        for (let s = 1n; s < nextSeq; s++) {
          const cid = (await publicClient.readContract({
            address: contractAddress,
            abi: BINGO_CARD_ABI,
            functionName: 'pendingReveal',
            args: [s],
          })) as bigint;
          if (cid === cardId) {
            if (!stop) setPendingSeq(s);
            return;
          }
        }
        if (!stop) setPendingSeq(null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, contractAddress, entropyAddr, card, cardId, refreshKey]);

  const pushReveal = () => {
    if (!entropyAddr || pendingSeq == null) return;
    writeReveal(
      {
        address: entropyAddr,
        abi: STATIC_ENTROPY_ABI,
        chainId: CHAIN_ID,
        functionName: 'pushCallback',
        args: [pendingSeq],
      },
      { onSuccess: () => setRefreshKey((k) => k + 1) },
    );
  };

  // Multiplier table for the bonus prize curve widget (shown post-submit).
  const multReads = useReadContracts({
    contracts: baseContract
      ? Array.from({ length: 11 }, (_, i) => ({
          ...baseContract,
          functionName: 'multiplierBps' as const,
          args: [BigInt(i)],
        }))
      : [],
    query: { enabled: !!baseContract },
  });
  const multipliers = multReads.data?.map(
    (r) => (r?.result as number | undefined) ?? 0,
  );

  // Poll cardOf every 3s (and immediately on refreshKey) so reveal, side
  // declaration, line funding, and claim all surface without a manual reload.
  useEffect(() => {
    if (!publicClient || !contractAddress) return;
    let stop = false;
    const tick = async () => {
      try {
        const c = (await publicClient.readContract({
          address: contractAddress,
          abi: BINGO_CARD_ABI,
          functionName: 'cardOf',
          args: [cardId],
        })) as CardSnapshot;
        if (stop) return;
        setCard(c);
        setStatusMsg(null);
      } catch (err) {
        if (stop) return;
        setStatusMsg(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const interval = window.setInterval(tick, 3_000);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
  }, [publicClient, contractAddress, cardId, refreshKey]);

  // Re-read once each line-funding run finishes.
  useEffect(() => {
    if (submitter.result) setRefreshKey((k) => k + 1);
  }, [submitter.result]);

  // Bonus preview + claimed flag.
  useEffect(() => {
    if (!publicClient || !contractAddress || !card?.revealed) {
      setPreview(null);
      return;
    }
    let stop = false;
    void (async () => {
      try {
        const [previewRes, claimedRes] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: BINGO_CARD_ABI,
            functionName: 'previewBonus',
            args: [cardId],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: BINGO_CARD_ABI,
            functionName: 'bonusClaimed',
            args: [cardId],
          }),
        ]);
        if (stop) return;
        const [wins, payout] = previewRes as [number, bigint];
        setPreview({ wins, payout });
        setClaimed(Boolean(claimedRes));
      } catch {
        setPreview(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, contractAddress, card, cardId, refreshKey]);

  // Pull condition images + titles from sapience API.
  useEffect(() => {
    if (!card?.revealed) return;
    let stop = false;
    void (async () => {
      try {
        const map = await fetchConditionsByIds(Array.from(card.conditionIds));
        if (stop) return;
        setConditionDetails(map);
      } catch {
        // best-effort
      }
    })();
    return () => {
      stop = true;
    };
  }, [card]);

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    setActionBusy(true);
    try {
      await fn();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  // One action: declare YES/NO sides on-chain, then immediately run the
  // auction + sponsored mint for all 10 lines inline. The card itself sponsors
  // each line's predictor collateral (predictorSponsor = BingoCard).
  const declareAndFund = async () => {
    if (!sessionClient || !card || !contractAddress) return;
    setActionError(null);
    setActionBusy(true);
    try {
      // setCellSides awaits its receipt, so sides are on-chain before funding.
      await setCellSidesViaSession(sessionClient, cardId, pickedSides);
      setRefreshKey((k) => k + 1);
      // Use the just-picked sides directly — the polled card may not have
      // re-read cellSides yet.
      await submitter.submit({
        cardId,
        conditionIds: card.conditionIds,
        resolvers: card.resolvers,
        cellSides: pickedSides,
        cardPriceWei: card.cardPriceAtMint,
        bingoCardAddress: contractAddress,
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  // Randomly assign YES/NO to all 16 cells.
  const quickPick = () => {
    let sides = 0;
    for (let i = 0; i < 16; i++) {
      if (Math.random() < 0.5) sides |= 1 << i;
    }
    setPickedSides(sides);
    setPickedMask(0xffff);
  };

  const submitClaimBonus = () => {
    if (!sessionClient) return;
    void runAction(() => claimBonusViaSession(sessionClient, cardId));
  };

  // Redeem a single won line's predictor position for its payout.
  const claimLine = (line: (typeof LINES)[number]) => {
    if (!sessionClient || !publicClient || !card || !smartAccount) return;
    const escrowAddr = escrowAddresses[CHAIN_ID]?.address as
      | Address
      | undefined;
    if (!escrowAddr) return;
    void runAction(async () => {
      const picks: Pick[] = line.cellIndices.map((ci) => ({
        conditionResolver: card.resolvers[ci],
        conditionId: card.conditionIds[ci],
        predictedOutcome:
          (card.cellSides & (1 << ci)) !== 0 ? OutcomeSide.YES : OutcomeSide.NO,
      }));
      const pcid = computePickConfigId(canonicalizePicks(picks));
      const pair = (await publicClient.readContract({
        address: escrowAddr,
        abi: ESCROW_TOKENPAIR_ABI,
        functionName: 'getTokenPair',
        args: [pcid],
      })) as { predictorToken: Address; counterpartyToken: Address };
      const bal = (await publicClient.readContract({
        address: pair.predictorToken,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [smartAccount],
      })) as bigint;
      if (bal === 0n) throw new Error('No position tokens to claim');
      await redeemViaSession(sessionClient, pair.predictorToken, bal);
    });
  };

  const submitWithdrawUnused = () => {
    if (!sessionClient) return;
    void runAction(() => withdrawUnusedViaSession(sessionClient, cardId));
  };

  const fundLines = () => {
    if (!card || !contractAddress) return;
    void submitter.submit({
      cardId,
      conditionIds: card.conditionIds,
      resolvers: card.resolvers,
      cellSides: card.cellSides,
      cardPriceWei: card.cardPriceAtMint,
      bingoCardAddress: contractAddress,
    });
  };

  // Read the real pool (stake + counterparty) for each funded line so the
  // "to win" amount survives a reload — recompute the pickConfigId from the
  // card's cells and ask the escrow.
  useEffect(() => {
    const escrowAddr = escrowAddresses[CHAIN_ID]?.address as Address | undefined;
    if (!publicClient || !card || !card.sidesDeclared || !escrowAddr) return;
    let stop = false;
    void (async () => {
      const out: Record<string, LineOutcome> = {};
      for (let i = 0; i < LINES.length; i++) {
        if ((card.filledLineBitmap & (1 << i)) === 0) continue;
        const l = LINES[i];
        const picks: Pick[] = l.cellIndices.map((ci) => ({
          conditionResolver: card.resolvers[ci],
          conditionId: card.conditionIds[ci],
          predictedOutcome:
            (card.cellSides & (1 << ci)) !== 0
              ? OutcomeSide.YES
              : OutcomeSide.NO,
        }));
        try {
          const pcid = computePickConfigId(canonicalizePicks(picks));
          const cfg = (await publicClient.readContract({
            address: escrowAddr,
            abi: ESCROW_PICKCONFIG_ABI,
            functionName: 'getPickConfiguration',
            args: [pcid],
          })) as {
            totalPredictorCollateral: bigint;
            totalCounterpartyCollateral: bigint;
            claimedPredictorCollateral: bigint;
            resolved: boolean;
            result: number;
          };
          out[l.id] = {
            pool:
              cfg.totalPredictorCollateral + cfg.totalCounterpartyCollateral,
            resolved: cfg.resolved,
            predictorWon: cfg.result === 1, // SettlementResult.PREDICTOR_WINS
            claimed: cfg.claimedPredictorCollateral > 0n,
          };
        } catch {
          /* leave unset */
        }
      }
      if (!stop) setLineOutcomes(out);
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, card, refreshKey]);

  // Once all 10 lines are funded, read each cell's resolution and compare to
  // the declared side: correct (✓), wrong (✗), or not-yet-resolved (loading).
  useEffect(() => {
    if (!publicClient || !card || !card.sidesDeclared) return;
    if ((card.filledLineBitmap & 0x3ff) !== 0x3ff) return;
    let stop = false;
    void (async () => {
      const out: Record<number, CellStatus> = {};
      for (let i = 0; i < 16; i++) {
        const declaredYes = (card.cellSides & (1 << i)) !== 0;
        let st: CellStatus = 'pending';
        try {
          const r = (await publicClient.readContract({
            address: card.resolvers[i],
            abi: RESOLVER_ABI,
            functionName: 'getResolution',
            args: [card.conditionIds[i]],
          })) as readonly [boolean, { yesWeight: bigint; noWeight: bigint }];
          const ok = r[0];
          const yw = r[1].yesWeight;
          const nw = r[1].noWeight;
          if (ok && !(yw === 0n && nw === 0n)) {
            const decisiveYes = yw > 0n && nw === 0n;
            const decisiveNo = nw > 0n && yw === 0n;
            st =
              (declaredYes && decisiveYes) || (!declaredYes && decisiveNo)
                ? 'correct'
                : 'wrong';
          }
        } catch {
          /* leave pending */
        }
        out[i] = st;
      }
      if (!stop) setCellStatus(out);
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, card, refreshKey]);

  const injected = connectors.find((c) => c.id === 'injected');
  const now = Math.floor(Date.now() / 1000);
  const isExpired = card != null && Number(card.expiresAt) < now;
  const lineCount = card
    ? Array.from({ length: 10 }).filter(
        (_, i) => (card.filledLineBitmap & (1 << i)) !== 0,
      ).length
    : 0;
  const cardComplete = lineCount === 10;
  const isPlayer =
    smartAccount &&
    card &&
    smartAccount.toLowerCase() === card.player.toLowerCase();

  // A funded session is required for every player action.
  const needsSession = isConnected && !isActive;

  const sessionPrompt = needsSession ? (
    <div className="admin-action">
      <p className="muted small">
        Sign in to act on this card (mint card, declare sides, fund lines,
        claim).
      </p>
      <button
        type="button"
        className="primary"
        disabled={isStarting || isRestoring}
        onClick={() => start(24 * 7)}
      >
        {isStarting
          ? 'Awaiting signature…'
          : isRestoring
            ? 'Restoring session…'
            : 'Sign in'}
      </button>
    </div>
  ) : null;

  return (
    <main>
      <Nav />
      {card && (
        <header className="receipt-head">
          <div className="receipt-thumb receipt-thumb-trophy" aria-hidden>
            ⚽
          </div>
          <div className="receipt-titles">
            <div className="receipt-eyebrow-row">
              <span className="label">
                Parlay Bingo · {cardComplete ? 'Live Bet' : 'Ready to Submit'}
              </span>
              <button
                type="button"
                className="details-link"
                onClick={() => setDetailsOpen(true)}
              >
                Details
              </button>
            </div>
            <h2 className="receipt-title">World Cup 2026</h2>
          </div>
        </header>
      )}

      {!contractAddress && (
        <section className="screen admin-section">
          <p className="muted small">
            Set the BingoCard contract address in Settings (gear icon).
          </p>
        </section>
      )}

      {contractAddress && !isConnected && injected && (
        <section className="screen admin-section">
          <button
            type="button"
            className="primary block"
            disabled={connectPending}
            onClick={() => connect({ connector: injected })}
          >
            {connectPending ? 'Opening wallet…' : 'Connect wallet'}
          </button>
        </section>
      )}

      {card && !card.revealed && (
        <section className="screen admin-section">
          <div className="reveal-pending">
            <div className="reveal-orb" aria-hidden />
            <div className="reveal-pending-body">
              <div className="wizard-step-title">Revealing your card…</div>
              <p className="muted small">
                {isMockEntropy
                  ? 'Staging uses a fixed placeholder instead of Pyth Entropy. Submit it to draw your 16 cells.'
                  : 'Drawing 16 conditions from the pool and shuffling your board.'}
              </p>
            </div>
            {isMockEntropy && pendingSeq != null && (
              <button
                type="button"
                className="primary"
                disabled={revealPending}
                onClick={pushReveal}
              >
                {revealPending ? 'Submitting…' : 'Submit placeholder randomness'}
              </button>
            )}
          </div>
        </section>
      )}

      {card && (
        <section className="screen admin-section">
          {sessionPrompt}

          {card.revealed && !card.sidesDeclared && isPlayer && (
            <div className="admin-action">
              <div className="bingo-grid">
                {card.conditionIds.map((id, i) => {
                  const isPicked = (pickedMask & (1 << i)) !== 0;
                  const yes = isPicked && (pickedSides & (1 << i)) !== 0;
                  const no = isPicked && (pickedSides & (1 << i)) === 0;
                  const detail = conditionDetails.get(id.toLowerCase());
                  return (
                    <div key={i} className="bingo-cell">
                      {detail?.similarMarketImage && (
                        <img
                          className="cell-thumb"
                          src={detail.similarMarketImage}
                          alt=""
                          aria-hidden
                        />
                      )}
                      <div
                        className="bingo-cell-title"
                        onMouseEnter={(e) =>
                          setTip({
                            text: detail?.question ?? detail?.shortName ?? id,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setTip((t) =>
                            t ? { ...t, x: e.clientX, y: e.clientY } : t,
                          )
                        }
                        onMouseLeave={() => setTip(null)}
                      >
                        {detail?.shortName ?? detail?.question ?? id}
                      </div>
                      <div className="bingo-side-toggle">
                        <button
                          type="button"
                          className={`pick yes ${yes ? 'on' : ''}`}
                          onClick={() => {
                            setPickedSides((p) => p | (1 << i));
                            setPickedMask((m) => m | (1 << i));
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          className={`pick no ${no ? 'on' : ''}`}
                          onClick={() => {
                            setPickedSides((p) => p & ~(1 << i));
                            setPickedMask((m) => m | (1 << i));
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pick-actions">
                <button
                  type="button"
                  className="quick-pick block"
                  disabled={actionBusy}
                  onClick={quickPick}
                >
                  Quick Pick
                </button>
                <button
                  type="button"
                  className="primary block"
                  disabled={
                    actionBusy || !sessionClient || !allCellsPicked || !isActive
                  }
                  onClick={declareAndFund}
                >
                  {actionBusy
                    ? 'Submitting…'
                    : allCellsPicked
                      ? 'Submit Picks'
                      : 'Make All Picks'}
                </button>
              </div>
            </div>
          )}

          {card.revealed && card.sidesDeclared && (
            <>
              {!cardComplete && isPlayer && (
                <div className="wizard-step-title">
                  {submitter.isSubmitting || actionBusy
                    ? `Submitting your 10 lines (${lineCount}/10)`
                    : `Submit your 10 lines (${lineCount}/10)`}
                </div>
              )}

              {/* Panel-wrapped 4×4 grid with each line's auction/mint status
                  in an offset square: rows on the right, cols on the bottom,
                  diagonals in the corners. */}
              <div className="submit-panel">
              <div className="locked-grid">
                {card.conditionIds.map((id, idx) => {
                  const yes = (card.cellSides & (1 << idx)) !== 0;
                  const detail = conditionDetails.get(id.toLowerCase());
                  const row = Math.floor(idx / 4);
                  const col = idx % 4;
                  const highlighted =
                    hoveredLineId != null &&
                    (LINES.find(
                      (l) => l.id === hoveredLineId,
                    )?.cellIndices.includes(idx) ??
                      false);
                  return (
                    <article
                      key={idx}
                      className={`cell locked-cell pick-${yes ? 'yes' : 'no'} ${
                        highlighted ? 'cell-highlight' : ''
                      }`}
                      style={{ gridColumn: col + 2, gridRow: row + 1 }}
                    >
                      {detail?.similarMarketImage && (
                        <img
                          className="cell-thumb"
                          src={detail.similarMarketImage}
                          alt=""
                          aria-hidden
                        />
                      )}
                      {cardComplete && (
                        <span
                          className={`cell-status cell-status-${
                            cellStatus[idx] ?? 'pending'
                          }`}
                          onMouseEnter={(e) =>
                            (cellStatus[idx] ?? 'pending') === 'pending' &&
                            detail?.endTime
                              ? setTip({
                                  text: `Est. end ${fmtEndTime(detail.endTime)}`,
                                  x: e.clientX,
                                  y: e.clientY,
                                })
                              : undefined
                          }
                          onMouseMove={(e) =>
                            setTip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : t,
                            )
                          }
                          onMouseLeave={() => setTip(null)}
                        >
                          <CellStatusIcon
                            status={cellStatus[idx] ?? 'pending'}
                          />
                        </span>
                      )}
                      <div
                        className="cell-text"
                        onMouseEnter={(e) =>
                          setTip({
                            text: detail?.question ?? detail?.shortName ?? id,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setTip((t) =>
                            t ? { ...t, x: e.clientX, y: e.clientY } : t,
                          )
                        }
                        onMouseLeave={() => setTip(null)}
                      >
                        {detail?.shortName ?? detail?.question ?? id}
                      </div>
                      <div className="locked-pick">{yes ? 'YES' : 'NO'}</div>
                    </article>
                  );
                })}

                {LINES.map((l, i) => {
                  const status = submitter.progress[l.id]?.status ?? 'pending';
                  const filled = (card.filledLineBitmap & (1 << i)) !== 0;
                  const done = filled || status === 'done';
                  // On-chain `filled` wins over transient submitter status: a
                  // retry re-attempts already-funded lines and they revert
                  // (LineAlreadyFilled) — don't paint those red/in-flight.
                  const submitFailed = !filled && status === 'failed';
                  const inflight =
                    !filled &&
                    (status === 'quoting' ||
                      status === 'signing' ||
                      status === 'submitting');
                  const o = lineOutcomes[l.id];

                  // Resolve the line's display verb/amount/tone.
                  let verb: string | null = null;
                  let amount: string | null = null;
                  let lost = submitFailed;
                  let won = false;
                  if (done && o) {
                    if (!o.resolved) {
                      verb = 'PENDING';
                      amount = fmtWin(o.pool);
                    } else if (o.predictorWon) {
                      verb = o.claimed ? 'WON' : 'CLAIM';
                      amount = fmtWin(o.pool);
                      won = true;
                    } else {
                      verb = 'LOST';
                      lost = true;
                    }
                  } else if (done) {
                    verb = 'PENDING';
                  }

                  const claimable = verb === 'CLAIM' && !!isPlayer;
                  return (
                    <div
                      key={l.id}
                      className={`payout-cell ${
                        l.kind === 'diag' ? 'diag-payout' : ''
                      } ${lost ? 'payout-failed' : ''} ${
                        inflight ? 'payout-inflight' : ''
                      } ${won ? 'payout-done' : ''} ${
                        done && !lost && !won ? 'payout-minted' : ''
                      } ${claimable ? 'payout-claimable' : ''}`}
                      style={LINE_POS[l.id]}
                      onMouseEnter={() => setHoveredLineId(l.id)}
                      onMouseLeave={() => setHoveredLineId(null)}
                      onClick={
                        claimable && !actionBusy
                          ? () => claimLine(l)
                          : undefined
                      }
                    >
                      {done ? (
                        <>
                          <div className="payout-verb">{verb}</div>
                          {amount && (
                            <>
                              {verb === 'PENDING' && (
                                <div className="payout-towin">to win</div>
                              )}
                              <div className="payout-amount">{amount}</div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="payout-status">
                          {lineStatusLabel(status)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>

              {!cardComplete && isPlayer && (
                <>
                  {submitter.error && (
                    <p className="error small">{submitter.error}</p>
                  )}
                  {!submitter.isSubmitting && !actionBusy && (
                    <button
                      type="button"
                      className="primary block"
                      disabled={!isActive}
                      onClick={fundLines}
                    >
                      {lineCount > 0 || submitter.error
                        ? 'Retry remaining lines'
                        : 'Submit lines'}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {cardComplete && multipliers && (
            <div className="bonus-curve">
              <div className="bonus-prize-title">Bonus Prize</div>
              <ol className="wizard bonus-wizard">
                {multipliers.map((bps, i) => {
                  const wins = preview?.wins ?? 0;
                  const status =
                    i < wins ? 'done' : i === wins ? 'current' : 'pending';
                  const payout = (card.cardPriceAtMint * BigInt(bps)) / 10_000n;
                  return (
                    <li key={i} className={`wizard-step status-${status}`}>
                      <div className="wizard-step-marker" aria-hidden>
                        {i}
                      </div>
                      <div className="wizard-step-body bonus-wizard-body">
                        <span className="bonus-wizard-wins">
                          {i} {i === 1 ? 'Bingo' : 'Bingos'}
                        </span>
                        <span className="bonus-wizard-prize">
                          {bps === 0
                            ? 'No Bonus'
                            : `${(bps / 10_000)
                                .toFixed(2)
                                .replace(/\.?0+$/, '')}× · $${fmtUnits(payout)}`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {cardComplete && !claimed && isPlayer && (
            <div>
              <button
                type="button"
                className="primary block"
                disabled={
                  actionBusy || !isActive || !preview || preview.wins < 2
                }
                onClick={() => {
                  if (
                    preview &&
                    preview.wins < 10 &&
                    !window.confirm(
                      `Claim is one-shot. You currently have ${preview.wins} winning lines. More may resolve later. Claim now?`,
                    )
                  ) {
                    return;
                  }
                  submitClaimBonus();
                }}
              >
                {actionBusy
                  ? 'Claiming…'
                  : preview && preview.wins >= 2
                    ? `Claim Bonus (${preview.wins} bingos)`
                    : 'Claim Bonus'}
              </button>
            </div>
          )}

          {isExpired && card.sponsorBalance > 0n && isPlayer && (
            <div className="admin-row">
              <button
                type="button"
                className="primary"
                disabled={actionBusy || !isActive}
                onClick={submitWithdrawUnused}
              >
                Withdraw unused ({fmtUnits(card.sponsorBalance)})
              </button>
            </div>
          )}

          {actionError && <p className="error">{actionError}</p>}
          {statusMsg && <p className="muted small">{statusMsg}</p>}
        </section>
      )}

      {detailsOpen && card && (
        <div
          className="bingo-modal-backdrop"
          onClick={() => setDetailsOpen(false)}
        >
          <div className="bingo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h2>Card details</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="admin-kv">
              <div>ID</div>
              <div className="mono">#{cardId.toString()}</div>
              <div>Player</div>
              <div className="mono">{shortAddress(card.player)}</div>
              <div>Ref code</div>
              <div className="mono">{card.refCode}</div>
              <div>Sponsor balance</div>
              <div className="mono">{fmtUnits(card.sponsorBalance)}</div>
              <div>Revealed</div>
              <div className="mono">{card.revealed ? 'yes' : 'no'}</div>
              <div>Sides declared</div>
              <div className="mono">{card.sidesDeclared ? 'yes' : 'no'}</div>
              <div>Lines funded</div>
              <div className="mono">{lineCount} / 10</div>
              <div>Expires at</div>
              <div className="mono">
                {new Date(Number(card.expiresAt) * 1000).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
      {tip && (
        <div
          className="cell-tip"
          style={{ left: tip.x + 14, top: tip.y + 16 }}
        >
          {tip.text}
        </div>
      )}
    </main>
  );
}
