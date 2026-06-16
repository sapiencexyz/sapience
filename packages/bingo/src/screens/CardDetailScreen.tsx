import { useEffect, useMemo, useRef, useState } from 'react';
import { isAddress, parseAbi, parseUnits, type Address } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import { OutcomeSide, type Pick } from '@sapience/sdk/types/escrow';
import { predictionMarketEscrow as escrowAddresses } from '@sapience/sdk/contracts';
import { usePublicClient } from 'wagmi';
import { CHAIN_ID } from '../lib/chain';
import { fmtUnits, shortAddress } from '../lib/format/balance';
import {
  fetchCard,
  fetchCards,
  fetchPool,
  fetchReceiptCard,
  submitCard,
  submitLine,
  type CardResponse,
  type CardsResponse,
  type PoolCardSummary,
  type PoolResponse,
} from '../lib/backendApi';
import {
  loadSession,
  redeemViaSession,
} from '../lib/session/sessionKeyManager';
import { useSession } from '../hooks/useSession';
import { useCollateralBalance } from '../hooks/blockchain/useCollateralBalance';
import { buildLines } from '../parlay';
import Nav from '../components/Nav';
import SetupWizard from '../components/SetupWizard';
import trophyUrl from '../assets/world-cup-trophy.png';

const LINES = buildLines();

/** Where each line's status square sits around the 4×4 grid:
 *  rows on the right edge, cols along the bottom, diagonals in the corners.
 *  Columns 2 and 7 (and row 5) are thin gutter tracks separating the flush
 *  4×4 block from the payout columns, so cells live in columns 3–6 / rows 1–4
 *  and the payouts in columns 1 / 8 / row 6. */
const LINE_POS: Record<string, { gridColumn: number; gridRow: number }> = (() => {
  const m: Record<string, { gridColumn: number; gridRow: number }> = {};
  for (let r = 0; r < 4; r++) m[`row-${r}`] = { gridColumn: 8, gridRow: r + 1 };
  for (let c = 0; c < 4; c++) m[`col-${c}`] = { gridColumn: c + 3, gridRow: 6 };
  m['diag-tr-bl'] = { gridColumn: 1, gridRow: 6 };
  m['diag-tl-br'] = { gridColumn: 8, gridRow: 6 };
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

function fmtOdds(price?: number | null): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  return `${Math.round(price * 100)}%`;
}

/** Hover popover for a cell: the full question, plus the estimated price and
 *  estimated end time when known (each on its own line). */
function cellTipText(cell: {
  question?: string | null;
  shortName?: string | null;
  conditionId: string;
  estimatedPrice?: number | null;
  endTime?: number | null;
}): string {
  const lines = [cell.question ?? cell.shortName ?? cell.conditionId];
  const price = fmtOdds(cell.estimatedPrice);
  if (price) lines.push(`Est. price ${price}`);
  if (cell.endTime) lines.push(`Est. end ${fmtEndTime(cell.endTime)}`);
  return lines.join('\n');
}

/** Gross payout if a line hits = the whole prediction pool (stake + counterparty). */
function fmtWin(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

/** A dollar amount that smoothly counts up whenever `value` increases — used
 *  for the funding overlay's running max payout. */
function AnimatedAmount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 450;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);
  return <>${display.toFixed(2)}</>;
}

/** Client-side per-line progress — the client drives each line's funding
 *  request against the stateless backend. */
type LineRun =
  | { status: 'funding' }
  | { status: 'done' }
  | { status: 'failed'; error: string };

function lineStatusLabel(run: LineRun | undefined): string {
  if (run?.status === 'funding') return 'FUNDING…';
  if (run?.status === 'failed') return 'FAILED';
  return 'WAITING';
}

function loadRef(): Address | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = window.localStorage.getItem('bingo-ref');
  return v && isAddress(v) ? (v as Address) : undefined;
}

/** The ?card=N query param, or null when absent/invalid. */
function cardIndexFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('card');
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The ?receipt=<tokenId> query param — a PUBLIC, view-only card permalink
 *  (no session/wallet needed; the receipt NFT id is the handle). */
function receiptIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('receipt');
  return v && /^\d{1,78}$/.test(v) ? v : null;
}

/** Funded flags are monotonic on-chain (escrow events can't un-happen), so
 *  never let a lagging backend read downgrade a line the UI already showed
 *  as funded — that's what made cards "reset to pending" on refresh races. */
function mergeCardMonotonic(
  prev: CardResponse | null,
  next: CardResponse,
): CardResponse {
  if (!prev || prev.receiptTokenId !== next.receiptTokenId) return next;
  return {
    ...next,
    lines: next.lines.map((l, i) =>
      !l.funded && prev.lines[i]?.funded ? { ...l, funded: true } : l,
    ),
  };
}

export default function CardDetailScreen() {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  const { client: sessionClient, isActive, config } = useSession();
  // The card is per-player: the connected session's smart account is the player.
  const player = config?.smartAccountAddress;

  // ?receipt=<id> = public view-only mode: anyone's card by receipt NFT id,
  // no session required, all write actions hidden.
  const [receiptId] = useState<string | null>(receiptIdFromUrl());
  const viewOnly = receiptId != null;

  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [card, setCard] = useState<CardResponse | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Which of the player's cards is shown. ?card=N wins; otherwise the last
  // submitted card (or a fresh card 0). null = not resolved yet.
  const [cardIndex, setCardIndex] = useState<number | null>(
    cardIndexFromUrl(),
  );
  const [cardsSummary, setCardsSummary] = useState<CardsResponse | null>(null);

  const [pickedSides, setPickedSides] = useState(0);
  const [pickedMask, setPickedMask] = useState(0);
  const allCellsPicked = (pickedMask & 0xffff) === 0xffff;

  // Card price input (only while unsubmitted). Defaults to the pool minimum.
  const [priceInput, setPriceInput] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);

  // Bumped after each action to force an immediate re-read.
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fillPreviousOpen, setFillPreviousOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
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

  // Pool config (multipliers, min card price). In receipt view the card can
  // belong to an OLD pool — fetch THAT pool (once the card tells us which),
  // not the active one, so the header and bonus curve match the card.
  const viewedPoolId = viewOnly ? card?.poolId : undefined;
  useEffect(() => {
    if (viewOnly && !viewedPoolId) return; // wait for the card to load
    let stop = false;
    fetchPool(viewedPoolId)
      .then((p) => {
        if (!stop) setPool(p);
      })
      .catch((e) => {
        if (!stop) setStatusMsg(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stop = true;
    };
  }, [viewOnly, viewedPoolId]);

  // Default the price input to the pool minimum once known.
  useEffect(() => {
    if (!pool || priceTouched) return;
    setPriceInput(fmtUnits(BigInt(pool.minCardPriceWei)));
  }, [pool, priceTouched]);

  // Resolve which card to show + keep the card list fresh: ?card=N wins,
  // otherwise default to the player's latest submitted card. Also runs in
  // receipt view — the strip of the viewer's own cards needs the list.
  useEffect(() => {
    if (!player) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await fetchCards(player);
        if (stop) return;
        setCardsSummary(s);
        // Clamp to the active pool's valid range — a stale ?card=N link
        // (e.g. bookmarked before a pool rollover) lands on the fresh card
        // instead of 404ing forever.
        if (!viewOnly) {
          setCardIndex((cur) =>
            Math.min(
              cur ?? cardIndexFromUrl() ?? Math.max(0, s.cardCount - 1),
              s.cardCount,
            ),
          );
        }
      } catch {
        // Card list is auxiliary; the card poll surfaces real errors.
        if (!stop && !viewOnly) {
          setCardIndex((cur) => cur ?? cardIndexFromUrl() ?? 0);
        }
      }
    };
    void tick();
    const interval = window.setInterval(tick, 5_000);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
  }, [player, viewOnly, refreshKey]);

  // Reset per-card state when switching cards — lineIds repeat across cards.
  useEffect(() => {
    setLineRuns({});
    setLineOutcomes({});
    setCellStatus({});
    setPickedSides(0);
    setPickedMask(0);
    setPriceTouched(false);
    setCard(null);
  }, [cardIndex]);

  // Poll the backend card every 3s (and immediately on refreshKey) so deal,
  // submission progress, and line funding all surface without a reload.
  useEffect(() => {
    if (viewOnly || !player || cardIndex == null) return;
    let stop = false;
    const tick = async () => {
      try {
        const c = await fetchCard(player, cardIndex);
        if (stop) return;
        setCard((prev) => mergeCardMonotonic(prev, c));
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
  }, [viewOnly, player, cardIndex, refreshKey]);

  // View-only: poll the public receipt endpoint instead (slower cadence —
  // nothing on this page is mid-flight).
  useEffect(() => {
    if (!receiptId) return;
    let stop = false;
    const tick = async () => {
      try {
        const c = await fetchReceiptCard(receiptId);
        if (stop) return;
        setCard((prev) => mergeCardMonotonic(prev, c));
        setStatusMsg(null);
      } catch (err) {
        if (stop) return;
        setStatusMsg(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const interval = window.setInterval(tick, 10_000);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
  }, [receiptId, refreshKey]);

  const submitted = card != null && card.yesMask != null;
  const yesMask = card?.yesMask ?? 0;
  const cardPriceWei =
    card?.cardPriceWei != null ? BigInt(card.cardPriceWei) : null;

  // Validate the entered price: wei, ≥ pool minimum, divisible by 10 lines.
  const enteredPriceWei: bigint | null = useMemo(() => {
    const v = priceInput.trim();
    if (!v) return null;
    try {
      const wei = parseUnits(v, 18);
      if (wei <= 0n) return null;
      if (wei % 10n !== 0n) return null;
      if (pool && wei < BigInt(pool.minCardPriceWei)) return null;
      return wei;
    } catch {
      return null;
    }
  }, [priceInput, pool]);

  // Spendable collateral = native USDe + wrapped (the backend wraps any
  // native shortfall). Drives the balance display + the pre-submit check —
  // without it, a too-high price only fails server-side AFTER the receipt
  // NFT has locked the card at a price the player can't fund.
  const { rawBalance: availableWei } = useCollateralBalance({
    address: player as Address | undefined,
    chainId: CHAIN_ID,
    enabled: !!player && !submitted,
  });
  const insufficientBalance =
    enteredPriceWei != null &&
    availableWei != null &&
    enteredPriceWei > availableWei;

  // Per-line client-side run state, keyed by lineId. The on-chain `funded`
  // flag from the backend is the durable truth; this only tracks requests
  // this page has in flight (or that failed here).
  const [lineRuns, setLineRuns] = useState<Record<string, LineRun>>({});

  const lineDone = (l: { lineId: string; funded: boolean }) =>
    l.funded || lineRuns[l.lineId]?.status === 'done';
  const doneFlags = (card?.lines ?? []).map(lineDone);
  const lineCount = doneFlags.filter(Boolean).length;
  const cardComplete = card != null && card.lines.length > 0 && lineCount === card.lines.length;
  const anyInflight = Object.values(lineRuns).some(
    (r) => r.status === 'funding',
  );
  const anyFailed = (card?.lines ?? []).some(
    (l) => !lineDone(l) && lineRuns[l.lineId]?.status === 'failed',
  );
  // While the 10 lines are being funded, fade the card and overlay a progress
  // bar + running total-to-win (sum of every line's pool as each one fills).
  const submitting = card != null && !cardComplete && (anyInflight || actionBusy);
  const totalToWinWei = LINES.reduce(
    (sum, l) => sum + (lineOutcomes[l.id]?.pool ?? 0n),
    0n,
  );

  // The signed-in player IS this card's player — write actions (fund,
  // claim) hang off this, so a receipt permalink works as the owner's own
  // card page too, not just a spectator view.
  const isOwner =
    !!player && !!card && player.toLowerCase() === card.player.toLowerCase();

  // Funds the given lines: one synchronous backend request each, all in
  // parallel. Idempotent — the backend skips already-funded lines. The
  // card's own poolId/cardIndex are used (not the selector state) so this
  // works on receipt permalinks as well.
  const fundLines = async (indices: number[]) => {
    const session = loadSession();
    if (!player || !session || !card) return;
    const lineIds = card.lines.map((l) => l.lineId);
    setActionError(null);
    setLineRuns((p) => {
      const next = { ...p };
      for (const i of indices) next[lineIds[i]] = { status: 'funding' };
      return next;
    });
    await Promise.allSettled(
      indices.map(async (i) => {
        try {
          await submitLine({
            player,
            poolId: card.poolId,
            cardIndex: card.cardIndex,
            lineIndex: i,
            session,
          });
          setLineRuns((p) => ({ ...p, [lineIds[i]]: { status: 'done' } }));
        } catch (e) {
          setLineRuns((p) => ({
            ...p,
            [lineIds[i]]: {
              status: 'failed',
              error: e instanceof Error ? e.message : String(e),
            },
          }));
        }
      }),
    );
    setRefreshKey((k) => k + 1);
  };

  // Submit the picks: the backend mints the receipt NFT (locking sides and
  // price on-chain), then this client drives the 10 line mints.
  const submitPicks = async () => {
    const session = loadSession();
    if (!player || enteredPriceWei == null || !session || cardIndex == null)
      return;
    setActionError(null);
    setActionBusy(true);
    try {
      const res = await submitCard({
        player,
        cardIndex,
        yesMask: pickedSides,
        cardPriceWei: enteredPriceWei.toString(),
        ref: loadRef(),
        session,
      });
      // Optimistic flip to the submitted view — without this the pick form
      // (with a re-enabled button) lingers until the next poll notices the
      // receipt. The poll then confirms with the same receiptTokenId.
      setCard((prev) =>
        prev
          ? {
              ...prev,
              yesMask: pickedSides,
              cardPriceWei: enteredPriceWei.toString(),
              submittedAt: Date.now(),
              receiptTokenId: res.receiptTokenId,
            }
          : prev,
      );
      setRefreshKey((k) => k + 1);
      void fundLines(Array.from({ length: 10 }, (_, i) => i));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  // Switch the visible card (and reflect it in the URL for reloads/sharing).
  const selectCard = (i: number) => {
    if (i === cardIndex) return;
    const u = new URL(window.location.href);
    u.searchParams.set('card', String(i));
    window.history.replaceState(null, '', u.toString());
    setCardIndex(i);
  };

  // Retry/resume: fund whichever lines aren't on-chain yet.
  const retryLines = async () => {
    if (!card) return;
    const indices = card.lines
      .map((l, i) => (lineDone(l) ? -1 : i))
      .filter((i) => i >= 0);
    await fundLines(indices);
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

  // Redeem a single won line's predictor position for its payout.
  const claimLine = (line: (typeof LINES)[number]) => {
    if (!sessionClient || !publicClient || !card || !player) return;
    if (card.yesMask == null) return;
    const escrowAddr = escrowAddresses[CHAIN_ID]?.address as
      | Address
      | undefined;
    if (!escrowAddr) return;
    const mask = card.yesMask;
    setActionError(null);
    setActionBusy(true);
    void (async () => {
      try {
        const picks: Pick[] = line.cellIndices.map((ci) => ({
          conditionResolver: card.cells[ci].resolver,
          conditionId: card.cells[ci].conditionId,
          predictedOutcome:
            (mask & (1 << ci)) !== 0 ? OutcomeSide.YES : OutcomeSide.NO,
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
          args: [player],
        })) as bigint;
        if (bal === 0n) throw new Error('No position tokens to claim');
        await redeemViaSession(sessionClient, pair.predictorToken, bal);
        setRefreshKey((k) => k + 1);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setActionBusy(false);
      }
    })();
  };

  // Read the real pool (stake + counterparty) for each funded line so the
  // "to win" amount survives a reload — recompute the pickConfigId from the
  // card's cells + declared sides and ask the escrow.
  // Re-read only when something material changes (which lines are funded /
  // which card), NOT on every 3s poll — `card` is a fresh object each poll
  // and using it as a dep re-fired 10 sequential reads per cycle.
  const outcomesKey = card
    ? `${card.receiptTokenId}:${card.yesMask}:${card.lines
        .map((l) => (l.funded ? 1 : 0))
        .join('')}`
    : '';
  const cardRef = useRef<CardResponse | null>(null);
  cardRef.current = card;
  useEffect(() => {
    const escrowAddr = escrowAddresses[CHAIN_ID]?.address as Address | undefined;
    const snapshot = cardRef.current;
    if (!publicClient || !snapshot || snapshot.yesMask == null || !escrowAddr)
      return;
    const mask = snapshot.yesMask;
    let stop = false;
    const tick = async () => {
      // All funded lines read in parallel; failures resolve to null so one
      // flaky RPC call can't hide the rest.
      const entries = await Promise.all(
        snapshot.lines
          .filter((l) => l.funded)
          .map(async (apiLine) => {
            const picks: Pick[] = apiLine.cellIndices.map((ci) => ({
              conditionResolver: snapshot.cells[ci].resolver,
              conditionId: snapshot.cells[ci].conditionId,
              predictedOutcome:
                (mask & (1 << ci)) !== 0 ? OutcomeSide.YES : OutcomeSide.NO,
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
              return [
                apiLine.lineId,
                {
                  pool:
                    cfg.totalPredictorCollateral +
                    cfg.totalCounterpartyCollateral,
                  resolved: cfg.resolved,
                  // SettlementResult.PREDICTOR_WINS
                  predictorWon: cfg.result === 1,
                  claimed: cfg.claimedPredictorCollateral > 0n,
                },
              ] as const;
            } catch {
              return null;
            }
          }),
      );
      if (stop) return;
      const out = Object.fromEntries(
        entries.filter((e): e is NonNullable<typeof e> => e != null),
      );
      // MERGE — a failed read must never blank an amount already on screen
      // (replacing the map each cycle is what made funded lines flap back
      // to bare "PENDING" after a refresh).
      setLineOutcomes((prev) => ({ ...prev, ...out }));
    };
    void tick();
    // Slow refresh keeps WON/CLAIM states current once matches resolve.
    const interval = window.setInterval(tick, 30_000);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, outcomesKey, refreshKey]);

  // Once all 10 lines are funded, read each cell's resolution and compare to
  // the declared side: correct (✓), wrong (✗), or not-yet-resolved (loading).
  useEffect(() => {
    const snapshot = cardRef.current;
    if (!publicClient || !snapshot || snapshot.yesMask == null) return;
    const allDone = snapshot.lines.every((l) => l.funded);
    if (!allDone || snapshot.lines.length === 0) return;
    const mask = snapshot.yesMask;
    let stop = false;
    const tick = async () => {
      const out: Record<number, CellStatus> = {};
      await Promise.all(
        snapshot.cells.map(async (cell, i) => {
          const declaredYes = (mask & (1 << i)) !== 0;
          try {
            const r = (await publicClient.readContract({
              address: cell.resolver,
              abi: RESOLVER_ABI,
              functionName: 'getResolution',
              args: [cell.conditionId],
            })) as readonly [boolean, { yesWeight: bigint; noWeight: bigint }];
            const ok = r[0];
            const yw = r[1].yesWeight;
            const nw = r[1].noWeight;
            if (ok && !(yw === 0n && nw === 0n)) {
              const decisiveYes = yw > 0n && nw === 0n;
              const decisiveNo = nw > 0n && yw === 0n;
              out[i] =
                (declaredYes && decisiveYes) || (!declaredYes && decisiveNo)
                  ? 'correct'
                  : 'wrong';
            }
          } catch {
            /* leave as-is — merge below keeps any prior decisive state */
          }
        }),
      );
      if (!stop) setCellStatus((prev) => ({ ...prev, ...out }));
    };
    void tick();
    const interval = window.setInterval(tick, 30_000);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, outcomesKey, refreshKey]);

  // Wins so far = funded lines that resolved in the predictor's favor.
  const wins = LINES.filter(
    (l) => lineOutcomes[l.id]?.resolved && lineOutcomes[l.id]?.predictorWon,
  ).length;

  // Card strip: every card the player holds, across all pools, grouped by
  // pool (newest first). Old pools' cards stay reachable after rollover —
  // chips link to receipt permalinks, which never go stale. The active
  // pool's group also carries the "+ new card" chip while it's open.
  const activePoolNumber = cardsSummary?.poolNumber ?? 1;
  const stripGroups = useMemo(() => {
    if (!cardsSummary) return [];
    const all: PoolCardSummary[] =
      cardsSummary.allCards ??
      // Backend predating the cross-pool list: active pool only.
      cardsSummary.cards.map((c) => ({
        ...c,
        poolId: cardsSummary.poolId,
        poolNumber: activePoolNumber,
        poolOpen: cardsSummary.open,
      }));
    const byPool = new Map<
      number,
      { poolId: string; cards: PoolCardSummary[] }
    >();
    for (const c of all) {
      const g = byPool.get(c.poolNumber) ?? { poolId: c.poolId, cards: [] };
      g.cards.push(c);
      byPool.set(c.poolNumber, g);
    }
    if (cardsSummary.open && !byPool.has(activePoolNumber)) {
      byPool.set(activePoolNumber, { poolId: cardsSummary.poolId, cards: [] });
    }
    return [...byPool.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([poolNumber, g]) => ({ poolNumber, ...g }));
  }, [cardsSummary, activePoolNumber]);

  return (
    <main>
      <Nav />
      {card && (
        <header className="receipt-head">
          <img className="receipt-thumb" src={trophyUrl} alt="" aria-hidden />

          <div className="receipt-titles">
            <span className="label">
              Combo Bingo · {cardComplete ? 'Live Bet' : 'Ready to Submit'}
            </span>
            <h2 className="receipt-title">World Cup 2026</h2>
          </div>
        </header>
      )}

      {/* Not set up yet → the get-ready wizard (connect → fund → sign). Once
          the session is active it falls away and the card below renders.
          Funding lives inside the wizard, between connect and sign. */}
      {!viewOnly && !isActive && (
        <section className="screen admin-section">
          <SetupWizard />
        </section>
      )}

      {/* Card strip — every card the player holds, across all pools.
          Chips are receipt permalinks (?receipt=N), so they survive pool
          rotation and double as share URLs. Hidden until the player owns at
          least one card; a first-timer just sees their fresh card below. */}
      {player && cardsSummary && stripGroups.some((g) => g.cards.length > 0) && (
        <section className="screen admin-section">
          <div className="card-strip">
            {stripGroups
              .flatMap((g) => g.cards)
              .map((c) => {
                const current = viewOnly
                  ? c.receiptTokenId === receiptId
                  : c.poolId === cardsSummary.poolId &&
                    c.cardIndex === cardIndex;
                return (
                  <a
                    key={c.receiptTokenId}
                    href={`/card?receipt=${c.receiptTokenId}`}
                    className={`card-chip ${current ? 'current' : ''} ${
                      c.linesFunded >= 10 ? 'filled' : ''
                    }`}
                  >
                    <span className="card-chip-id">Card #{c.receiptTokenId}</span>
                    <span className="card-chip-sub">
                      {c.linesFunded >= 10 ? '✓' : `${c.linesFunded}/10`}
                    </span>
                  </a>
                );
              })}
            {cardsSummary.open && (
              <a
                href={`/card?card=${cardsSummary.cardCount}`}
                className={`card-chip card-chip-new ${
                  !viewOnly && cardIndex === cardsSummary.cardCount
                    ? 'current'
                    : ''
                }`}
                onClick={(e) => {
                  // A card with unfunded lines forfeits bonus eligibility —
                  // block the next card until every line of the ACTIVE pool's
                  // cards is funded (old pools are closed; they can't be
                  // filled, so they don't gate).
                  const unfilled = cardsSummary.cards.some(
                    (c) => c.linesFunded < 10,
                  );
                  if (unfilled) {
                    e.preventDefault();
                    setFillPreviousOpen(true);
                  } else if (!viewOnly) {
                    e.preventDefault();
                    selectCard(cardsSummary.cardCount);
                  }
                }}
              >
                + New
              </a>
            )}
          </div>
        </section>
      )}

      {card && (
        <div className="card-meta-bar">
          {pool && (
            <span className="label muted">
              Pool #{pool.poolNumber} ·{' '}
              {card.open
                ? `closes ${new Date(card.cutoff * 1000).toLocaleString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    },
                  )}`
                : 'closed'}
            </span>
          )}
          <span className="card-meta-actions">
            {card.receiptTokenId && (
              <button
                type="button"
                className="details-link"
                onClick={() => {
                  // The public, view-only permalink for this card —
                  // anyone can open it, no wallet needed.
                  const url = `${window.location.origin}/card?receipt=${card.receiptTokenId}`;
                  void navigator.clipboard.writeText(url).then(() => {
                    setShareCopied(true);
                    window.setTimeout(() => setShareCopied(false), 1500);
                  });
                }}
              >
                {shareCopied ? 'Copied!' : 'Share'}
              </button>
            )}
            <button
              type="button"
              className="details-link"
              onClick={() => setDetailsOpen(true)}
            >
              Details
            </button>
          </span>
        </div>
      )}

      {card && (player || viewOnly) && (
        <section className="screen admin-section">
          {!submitted && (
            <div className="admin-action">
              <div className="card-frame">
                <div className="bingo-grid">
                {card.cells.map((cell, i) => {
                  const isPicked = (pickedMask & (1 << i)) !== 0;
                  const yes = isPicked && (pickedSides & (1 << i)) !== 0;
                  const no = isPicked && (pickedSides & (1 << i)) === 0;
                  return (
                    <div
                      key={i}
                      className="bingo-cell"
                      onMouseEnter={(e) =>
                        setTip({
                          text: cellTipText(cell),
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
                      <div className="bingo-cell-title">
                        {cell.shortName ?? cell.question ?? cell.conditionId}
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
              </div>
              <div className="field price-field">
                <div className="price-field-labels">
                  <label className="label" htmlFor="card-price">
                    Card price (USDe)
                  </label>
                  {availableWei != null && (
                    <span className="label muted">
                      Available: {fmtUnits(availableWei)} USDe
                    </span>
                  )}
                </div>
                <input
                  id="card-price"
                  className="admin-input"
                  inputMode="decimal"
                  placeholder={
                    pool ? fmtUnits(BigInt(pool.minCardPriceWei)) : '10'
                  }
                  value={priceInput}
                  onChange={(e) => {
                    setPriceTouched(true);
                    setPriceInput(e.target.value);
                  }}
                  disabled={actionBusy}
                />
                {priceInput.trim() && enteredPriceWei == null && (
                  <p className="muted small">
                    Must be a multiple of 10 wei
                    {pool
                      ? ` and at least ${fmtUnits(BigInt(pool.minCardPriceWei))}`
                      : ''}
                    .
                  </p>
                )}
                {insufficientBalance && (
                  <p className="error small">
                    Not enough USDe — you have {fmtUnits(availableWei)}{' '}
                    available.
                  </p>
                )}
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
                    actionBusy ||
                    !isActive ||
                    !allCellsPicked ||
                    enteredPriceWei == null ||
                    insufficientBalance
                  }
                  onClick={submitPicks}
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

          {submitted && (
            <>
              {!cardComplete && (!viewOnly || isOwner) && (
                <div className="wizard-step-title">
                  {anyInflight || actionBusy
                    ? `Submitting your 10 lines (${lineCount}/10)`
                    : `Submit your 10 lines (${lineCount}/10)`}
                </div>
              )}

              {/* Panel-wrapped 4×4 grid with each line's auction/mint status
                  in an offset square: rows on the right, cols on the bottom,
                  diagonals in the corners. */}
              <div className="submit-panel">
              <div className="locked-grid">
                {card.cells.map((cell, idx) => {
                  const yes = (yesMask & (1 << idx)) !== 0;
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
                      style={{ gridColumn: col + 3, gridRow: row + 1 }}
                      onMouseEnter={(e) =>
                        setTip({
                          text: cellTipText(cell),
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
                      <div className="cell-text">
                        {cell.shortName ?? cell.question ?? cell.conditionId}
                      </div>
                      <div className="locked-foot">
                        <span className="locked-pick">{yes ? 'YES' : 'NO'}</span>
                        {/* Once resolved, mark the cell correct/wrong, right
                            of the pick; while pending we show no icon — the
                            estimated end time lives in the hover popover. */}
                        {cardComplete &&
                          (cellStatus[idx] ?? 'pending') !== 'pending' && (
                            <span
                              className={`cell-status cell-status-${cellStatus[idx]}`}
                            >
                              <CellStatusIcon status={cellStatus[idx]!} />
                            </span>
                          )}
                      </div>
                    </article>
                  );
                })}

                {/* Rainbow frame drawn over the flush 4×4 block (the payout
                    columns sit outside it). */}
                <div
                  className="locked-frame"
                  style={{ gridColumn: '3 / 7', gridRow: '1 / 5' }}
                  aria-hidden
                />

                {LINES.map((l) => {
                  const apiLine = card.lines.find((x) => x.lineId === l.id);
                  const run = lineRuns[l.id];
                  const funded = apiLine?.funded ?? false;
                  // funded (on-chain) or done (just minted) = the line exists.
                  const done = funded || run?.status === 'done';
                  const submitFailed = !done && run?.status === 'failed';
                  const inflight = !done && run?.status === 'funding';
                  const o = lineOutcomes[l.id];

                  // The per-cell resolution tells us the line outcome before
                  // the escrow's own flag. A line is a parlay of its cells: it
                  // LOSES the moment any one cell is wrong, and only WINS once
                  // every cell has come in correct.
                  const lineCellStatuses = l.cellIndices.map(
                    (i) => cellStatus[i] ?? 'pending',
                  );
                  const lineLost =
                    cardComplete && lineCellStatuses.some((s) => s === 'wrong');
                  const lineWon =
                    cardComplete &&
                    lineCellStatuses.every((s) => s === 'correct');

                  // Resolve the line's display verb/amount/tone.
                  let verb: string | null = null;
                  let amount: string | null = null;
                  let lost = submitFailed;
                  let won = false;
                  if (done) {
                    if (lineLost) {
                      verb = 'LOST';
                      lost = true;
                    } else if (lineWon) {
                      // Claimable only once the escrow itself has resolved the
                      // win and it's still unclaimed.
                      verb = o?.predictorWon && !o.claimed ? 'CLAIM' : 'WON';
                      won = true;
                      if (o) amount = fmtWin(o.pool);
                    } else {
                      verb = 'PENDING';
                      if (o) amount = fmtWin(o.pool);
                    }
                  }

                  // Claiming needs the viewer's session to BE the card's
                  // player — on a public receipt URL the square is display-only.
                  const claimable =
                    verb === 'CLAIM' &&
                    isActive &&
                    player?.toLowerCase() === card.player.toLowerCase();
                  // Each row/col forms a flush strip (right edge / bottom edge);
                  // only the two end boxes get rounded outer corners, the rest
                  // share a single 1px divider. Diagonals stand alone.
                  const stripIdx = Number(l.id.slice(l.id.lastIndexOf('-') + 1));
                  const stripClass =
                    l.kind === 'row'
                      ? 'payout-vert'
                      : l.kind === 'col'
                        ? 'payout-horz'
                        : '';
                  const stripEnd =
                    l.kind === 'diag'
                      ? ''
                      : stripIdx === 0
                        ? 'payout-end-first'
                        : stripIdx === 3
                          ? 'payout-end-last'
                          : '';
                  return (
                    <div
                      key={l.id}
                      className={`payout-cell ${stripClass} ${stripEnd} ${
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
                          {lineStatusLabel(run)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {submitting && (
                <div className="funding-overlay">
                  <div className="funding-overlay-inner">
                    <div className="funding-head">Submitting your card</div>
                    <div className="funding-count">
                      {lineCount}
                      <span>/{card.lines.length}</span> lines created
                    </div>
                    <div className="funding-bar">
                      <div
                        className="funding-bar-fill"
                        style={{
                          width: `${(lineCount / card.lines.length) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="funding-towin">
                      <span className="funding-towin-label">Max payout</span>
                      <span className="funding-towin-amount">
                        <AnimatedAmount value={Number(totalToWinWei) / 1e18} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
              </div>

              {!cardComplete && (!viewOnly || isOwner) && (
                <>
                  {anyFailed && (
                    <p className="error small">
                      {Object.values(lineRuns)
                        .map((r) => (r.status === 'failed' ? r.error : null))
                        .find(Boolean) ?? 'Some lines failed to fund.'}
                    </p>
                  )}
                  {/* The client drives line funding: offer to (re)start it
                      whenever lines are missing and nothing is in flight —
                      covers failures, page reloads, and interrupted runs.
                      Only while the pool is open (closed pools refuse new
                      lines) and only to the card's owner. */}
                  {!anyInflight && !actionBusy && card.open && (
                    <button
                      type="button"
                      className="primary block"
                      disabled={!isActive || (viewOnly && !isOwner)}
                      onClick={retryLines}
                    >
                      {anyFailed
                        ? 'Retry remaining lines'
                        : `Fund remaining lines (${lineCount}/10)`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {pool && cardPriceWei != null && (
            <div className="stat-strip">
              <div className="stat">
                <span className="label">Stake</span>
                <span className="stat-value">
                  {fmtUnits(cardPriceWei)}
                  <span className="stat-unit">USDe</span>
                </span>
              </div>

              <div className="stat bonus-stat">
                <span className="label bonus-label">
                  Bonus
                  <span
                    className="bonus-info"
                    tabIndex={0}
                    role="button"
                    aria-label="Bonus prize details"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  </span>
                </span>
                <span className="stat-value">
                  {pool.multiplierBps[wins] && pool.multiplierBps[wins] > 0
                    ? `${(pool.multiplierBps[wins] / 10_000)
                        .toFixed(2)
                        .replace(/\.?0+$/, '')}x`
                    : '1x'}
                </span>
                {/* The info icon (in the label) reveals the full ladder. */}
                <div className="bonus-popover" role="tooltip">
                  <div className="bonus-prize-title">Bonus Prize</div>
                  <ol className="wizard bonus-wizard">
                    {pool.multiplierBps.map((bps, i) => {
                      const status =
                        i < wins ? 'done' : i === wins ? 'current' : 'pending';
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
                                    .replace(/\.?0+$/, '')}×`}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {wins > 0 && (
                    <p className="muted small">
                      Current entitlement: $
                      {fmtUnits(
                        (cardPriceWei * BigInt(pool.multiplierBps[wins] ?? 0)) /
                          10_000n,
                      )}{' '}
                      ({wins} {wins === 1 ? 'bingo' : 'bingos'}).
                    </p>
                  )}
                </div>
              </div>

              <div className="stat payout">
                <span className="label">Payout</span>
                <span
                  className={`stat-value ${
                    totalToWinWei > 0n ? 'payout-win' : ''
                  }`}
                >
                  {fmtWin(totalToWinWei)}
                </span>
              </div>
            </div>
          )}

          {actionError && <p className="error">{actionError}</p>}
          {statusMsg && <p className="muted small">{statusMsg}</p>}
        </section>
      )}

      {!card && (player || viewOnly) && !statusMsg && (
        <section className="screen admin-section">
          <div className="card-loader">
            <div className="card-loader-ring" aria-hidden />
          </div>
        </section>
      )}
      {!card && statusMsg && (
        <section className="screen admin-section">
          <p className="error small">{statusMsg}</p>
        </section>
      )}

      {fillPreviousOpen && (
        <div
          className="bingo-modal-backdrop"
          onClick={() => setFillPreviousOpen(false)}
        >
          <div className="bingo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h2>Fill your card first</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setFillPreviousOpen(false)}
              >
                Close
              </button>
            </div>
            <p>
              You must fill your previous card to remain eligible for bonus
              multipliers.
            </p>
          </div>
        </div>
      )}

      {detailsOpen && card && (
        <div
          className="bingo-modal-backdrop"
          onClick={() => setDetailsOpen(false)}
        >
          <div className="bingo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h2>Card Details</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="admin-kv">
              <div>Pool</div>
              <div className="mono">{card.poolId}</div>
              <div>Card</div>
              <div className="mono">
                #{card.cardIndex + 1} of {Math.max(card.cardCount, card.cardIndex + 1)}
              </div>
              <div>Player</div>
              <div className="mono">{shortAddress(card.player)}</div>
              <div>Card price</div>
              <div className="mono">{fmtUnits(cardPriceWei ?? undefined)}</div>
              <div>Submitted</div>
              <div className="mono">
                {card.submittedAt
                  ? new Date(card.submittedAt).toLocaleString()
                  : 'no'}
              </div>
              <div>Lines funded</div>
              <div className="mono">
                {lineCount} / {card.lines.length}
              </div>
              <div>Pool cutoff</div>
              <div className="mono">
                {new Date(card.cutoff * 1000).toLocaleString()}
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
          {tip.text.split('\n').map((line, i) => (
            <div
              key={i}
              className={i === 0 ? 'cell-tip-q' : 'cell-tip-meta'}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
