import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseAbi, parseUnits, type Address } from 'viem';
import {
  canonicalizePicks,
  computePickConfigId,
} from '@sapience/sdk/auction/escrowEncoding';
import { OutcomeSide, type Pick } from '@sapience/sdk/types/escrow';
import { predictionMarketEscrow as escrowAddresses } from '@sapience/sdk/contracts';
import { useAccount, useConnect, usePublicClient } from 'wagmi';
import { CHAIN_ID } from '../lib/chain';
import { fmtUnits, shortAddress } from '../lib/format/balance';
import {
  fetchCard,
  fetchPool,
  submitCard,
  type CardResponse,
  type PoolResponse,
} from '../lib/backendApi';
import { redeemViaSession } from '../lib/session/sessionKeyManager';
import { useSession } from '../hooks/useSession';
import { buildLines } from '../parlay';
import Nav from '../components/Nav';

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

function loadRef(): Address | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = window.localStorage.getItem('bingo-ref');
  return v && isAddress(v) ? (v as Address) : undefined;
}

export default function CardDetailScreen() {
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
  // The card is per-player: the connected session's smart account is the player.
  const player = config?.smartAccountAddress;

  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [card, setCard] = useState<CardResponse | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

  // Pool config (multipliers, min card price) — fetched once.
  useEffect(() => {
    let stop = false;
    fetchPool()
      .then((p) => {
        if (!stop) setPool(p);
      })
      .catch((e) => {
        if (!stop) setStatusMsg(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stop = true;
    };
  }, []);

  // Default the price input to the pool minimum once known.
  useEffect(() => {
    if (!pool || priceTouched) return;
    setPriceInput(fmtUnits(BigInt(pool.minCardPriceWei)));
  }, [pool, priceTouched]);

  // Poll the backend card every 3s (and immediately on refreshKey) so deal,
  // submission progress, and line funding all surface without a reload.
  useEffect(() => {
    if (!player) return;
    let stop = false;
    const tick = async () => {
      try {
        const c = await fetchCard(player);
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
  }, [player, refreshKey]);

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

  const doneFlags = (card?.lines ?? []).map(
    (l) => l.funded || l.status === 'done',
  );
  const lineCount = doneFlags.filter(Boolean).length;
  const cardComplete = card != null && card.lines.length > 0 && lineCount === card.lines.length;
  const anyFailed = (card?.lines ?? []).some(
    (l) => !l.funded && l.status === 'failed',
  );
  const anyInflight = (card?.lines ?? []).some(
    (l) =>
      !l.funded &&
      (l.status === 'pending' ||
        l.status === 'quoting' ||
        l.status === 'signing' ||
        l.status === 'submitting'),
  );
  // Submitted but some lines have no status at all: the backend restarted
  // mid-run and lost its in-memory progress. Treat like a failure so the
  // retry button appears (the backend skips already-funded lines).
  const anyStalled =
    card?.yesMask != null &&
    !cardComplete &&
    !anyInflight &&
    (card?.lines ?? []).some((l) => !l.funded && l.status == null);

  // Submit the picks: backend mints all 10 lines as the player.
  const submitPicks = async () => {
    if (!player || enteredPriceWei == null) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await submitCard({
        player,
        yesMask: pickedSides,
        cardPriceWei: enteredPriceWei.toString(),
        ref: loadRef(),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  // Retry: identical yesMask/price — the backend is idempotent per line.
  const retryLines = async () => {
    if (!player || card == null || card.yesMask == null || !card.cardPriceWei)
      return;
    setActionError(null);
    setActionBusy(true);
    try {
      await submitCard({
        player,
        yesMask: card.yesMask,
        cardPriceWei: card.cardPriceWei,
        ref: loadRef(),
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
  useEffect(() => {
    const escrowAddr = escrowAddresses[CHAIN_ID]?.address as Address | undefined;
    if (!publicClient || !card || card.yesMask == null || !escrowAddr) return;
    const mask = card.yesMask;
    let stop = false;
    void (async () => {
      const out: Record<string, LineOutcome> = {};
      for (const apiLine of card.lines) {
        if (!(apiLine.funded || apiLine.status === 'done')) continue;
        const picks: Pick[] = apiLine.cellIndices.map((ci) => ({
          conditionResolver: card.cells[ci].resolver,
          conditionId: card.cells[ci].conditionId,
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
          out[apiLine.lineId] = {
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
    if (!publicClient || !card || card.yesMask == null) return;
    const allDone = card.lines.every((l) => l.funded || l.status === 'done');
    if (!allDone || card.lines.length === 0) return;
    const mask = card.yesMask;
    let stop = false;
    void (async () => {
      const out: Record<number, CellStatus> = {};
      for (let i = 0; i < card.cells.length; i++) {
        const declaredYes = (mask & (1 << i)) !== 0;
        let st: CellStatus = 'pending';
        try {
          const r = (await publicClient.readContract({
            address: card.cells[i].resolver,
            abi: RESOLVER_ABI,
            functionName: 'getResolution',
            args: [card.cells[i].conditionId],
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

  // Wins so far = funded lines that resolved in the predictor's favor.
  const wins = LINES.filter(
    (l) => lineOutcomes[l.id]?.resolved && lineOutcomes[l.id]?.predictorWon,
  ).length;

  const injected = connectors.find((c) => c.id === 'injected');

  // A session is required: it identifies the player (smart account) and lets
  // the backend mint lines on their behalf.
  const needsSession = isConnected && !isActive;

  const sessionPrompt = needsSession ? (
    <div className="admin-action">
      <p className="muted small">
        Sign in to see your card, pick sides, and submit.
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

      {!isConnected && injected && (
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

      {needsSession && (
        <section className="screen admin-section">{sessionPrompt}</section>
      )}

      {card && player && (
        <section className="screen admin-section">
          {!submitted && (
            <div className="admin-action">
              <div className="bingo-grid">
                {card.cells.map((cell, i) => {
                  const isPicked = (pickedMask & (1 << i)) !== 0;
                  const yes = isPicked && (pickedSides & (1 << i)) !== 0;
                  const no = isPicked && (pickedSides & (1 << i)) === 0;
                  return (
                    <div key={i} className="bingo-cell">
                      {cell.imageUrl && (
                        <img
                          className="cell-thumb"
                          src={cell.imageUrl}
                          alt=""
                          aria-hidden
                        />
                      )}
                      <div
                        className="bingo-cell-title"
                        onMouseEnter={(e) =>
                          setTip({
                            text:
                              cell.question ??
                              cell.shortName ??
                              cell.conditionId,
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
              <div className="field">
                <label className="label" htmlFor="card-price">
                  Card price (USDe)
                </label>
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
                    enteredPriceWei == null
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
              {!cardComplete && (
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
                      style={{ gridColumn: col + 2, gridRow: row + 1 }}
                    >
                      {cell.imageUrl && (
                        <img
                          className="cell-thumb"
                          src={cell.imageUrl}
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
                            cell.endTime
                              ? setTip({
                                  text: `Est. end ${fmtEndTime(cell.endTime)}`,
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
                            text:
                              cell.question ??
                              cell.shortName ??
                              cell.conditionId,
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
                        {cell.shortName ?? cell.question ?? cell.conditionId}
                      </div>
                      <div className="locked-pick">{yes ? 'YES' : 'NO'}</div>
                    </article>
                  );
                })}

                {LINES.map((l) => {
                  const apiLine = card.lines.find((x) => x.lineId === l.id);
                  const status = apiLine?.status ?? 'pending';
                  const funded = apiLine?.funded ?? false;
                  // funded (on-chain) or done (just minted) = the line exists.
                  const done = funded || status === 'done';
                  const submitFailed = !funded && status === 'failed';
                  const inflight =
                    !funded &&
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

                  const claimable = verb === 'CLAIM' && isActive;
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

              {!cardComplete && (
                <>
                  {anyFailed && (
                    <p className="error small">
                      {card.lines.find((l) => !l.funded && l.error)?.error ??
                        'Some lines failed to fund.'}
                    </p>
                  )}
                  {(anyFailed || anyStalled) && !anyInflight && !actionBusy && (
                    <button
                      type="button"
                      className="primary block"
                      disabled={!isActive}
                      onClick={retryLines}
                    >
                      Retry remaining lines
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {cardComplete && pool && cardPriceWei != null && (
            <div className="bonus-curve">
              <div className="bonus-prize-title">Bonus Prize</div>
              <p className="muted small">
                Bonuses are paid out directly by COMBO.BINGO.
              </p>
              <ol className="wizard bonus-wizard">
                {pool.multiplierBps.map((bps, i) => {
                  const status =
                    i < wins ? 'done' : i === wins ? 'current' : 'pending';
                  const payout = (cardPriceWei * BigInt(bps)) / 10_000n;
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
              {wins > 0 && (
                <p className="muted small">
                  Current entitlement: $
                  {fmtUnits(
                    (cardPriceWei *
                      BigInt(pool.multiplierBps[wins] ?? 0)) /
                      10_000n,
                  )}{' '}
                  ({wins} {wins === 1 ? 'bingo' : 'bingos'}) — paid out
                  directly by COMBO.BINGO.
                </p>
              )}
            </div>
          )}

          {actionError && <p className="error">{actionError}</p>}
          {statusMsg && <p className="muted small">{statusMsg}</p>}
        </section>
      )}

      {!card && player && !statusMsg && (
        <section className="screen admin-section">
          <p className="muted small">Dealing your card…</p>
        </section>
      )}
      {!card && statusMsg && (
        <section className="screen admin-section">
          <p className="error small">{statusMsg}</p>
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
              <div>Pool</div>
              <div className="mono">{card.poolId}</div>
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
          {tip.text}
        </div>
      )}
    </main>
  );
}
