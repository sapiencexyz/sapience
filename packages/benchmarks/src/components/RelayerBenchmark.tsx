import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { createPublicClient, http, formatUnits, type Hex, type Address } from 'viem';
import { isPredictedYes } from '@sapience/sdk/types/escrow';
import { computeStats, type Stats } from '../lib/stats';
import { buildRandomPicks, type ConditionInfo, type EnrichedPick } from '../lib/picks';
import {
  createSigner,
  connectWs,
  createSessionPublicClient,
  setupMessageHandler,
  sendAuction,
  type RelayerSession,
  type AuctionTiming,
} from '../lib/relayerRunner';
import type { EnvConfig } from '../lib/constants';

interface Props {
  config: EnvConfig;
  conditions: ConditionInfo[];
}

type AuctionState = 'pending' | 'acked' | 'bid' | 'validated' | 'error';

interface AuctionRow {
  id: string;
  sentAt: number;
  state: AuctionState;
  ackMs?: number;
  bidMs?: number;
  validBidMs?: number;
  estimatorBidMs?: number;
  validating?: boolean;
  error?: string;
  validationError?: string;
  predictorCollateral?: string;
  estimatorCollateral?: string;
  usableCollateral?: string;
  pickCount?: number;
  // For detail dialog
  rfqPayload?: Record<string, unknown>;
  auctionId?: string;
  picks?: EnrichedPick[];
}

interface WalletInfo {
  balance: string;
  balanceWei: bigint;
}

const erc20Abi = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

async function fetchWalletInfo(address: Address, config: EnvConfig): Promise<WalletInfo> {
  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const balance = await client.readContract({
    address: config.collateralAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return { balance: formatUnits(balance, 18), balanceWei: balance };
}

function fmt(n: number, d = 0): string { return n.toFixed(d); }
function fmtWei(wei: string): string {
  const n = Number(wei) / 1e18;
  return n < 0.01 ? '<0.01' : n.toFixed(2);
}
function impliedChance(predictorWei: string, counterpartyWei: string): string {
  const p = Number(predictorWei);
  const c = Number(counterpartyWei);
  if (p + c <= 0) return '?';
  return fmt((p / (p + c)) * 100, 0);
}
function fmtUsde(val: string): string {
  const n = parseFloat(val);
  if (n >= 1e15) return 'unlimited';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function computeExpectedQuote(picks: EnrichedPick[], predictorCollateralWei: string) {
  const probs: number[] = [];
  for (const p of picks) {
    if (p.estimatedPrice == null) return null;
    // estimatedPrice is probability of YES; adjust for predicted outcome
    const prob = isPredictedYes(p.predictedOutcome) ? p.estimatedPrice : 1 - p.estimatedPrice;
    if (prob <= 0 || prob >= 1) return null;
    probs.push(prob);
  }
  const comboProb = probs.reduce((a, b) => a * b, 1);
  if (comboProb <= 0 || comboProb >= 1) return null;
  const predictorWei = Number(predictorCollateralWei);
  const expectedCounterpartyWei = predictorWei * (1 / comboProb - 1);
  return { comboProb, expectedCounterpartyWei };
}

function PickCard({ pick }: { pick: EnrichedPick }) {
  const yes = isPredictedYes(pick.predictedOutcome);
  const hasPrice = pick.estimatedPrice != null;
  const marketPrice = hasPrice ? pick.estimatedPrice! : null;
  const winProb = hasPrice ? (yes ? marketPrice! : 1 - marketPrice!) : null;

  return (
    <div className="pick-card">
      <div className="pick-question">{pick.question ?? pick.conditionId.slice(0, 16)}</div>
      <div className="pick-details">
        <span className={`pick-outcome ${yes ? 'pick-yes' : 'pick-no'}`}>
          {yes ? 'YES' : 'NO'}
        </span>
        {hasPrice && (
          <span className="pick-price">
            Polymarket: {pick.polymarketUrl ? (
              <a href={pick.polymarketUrl} target="_blank" rel="noopener noreferrer" className="pick-link">
                {marketPrice!.toFixed(2)}
              </a>
            ) : marketPrice!.toFixed(2)} &middot; Win Probability: {fmt(winProb! * 100, 0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function AuctionDialog({ row, onClose }: { row: AuctionRow; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const stateLabel: Record<AuctionState, string> = {
    pending: 'Pending',
    acked: 'Acknowledged',
    bid: 'Bid received (not usable)',
    validated: 'Usable bid received',
    error: 'Error',
  };

  const sections: { label: string; content: ReactNode }[] = [
    { label: 'Status', content: stateLabel[row.state] },
    { label: 'Auction ID', content: row.auctionId ?? row.id },
  ];

  if (row.ackMs !== undefined) sections.push({ label: 'Ack latency', content: `${fmt(row.ackMs)}ms` });
  if (row.bidMs !== undefined) sections.push({ label: 'Time to bid', content: `${fmt(row.bidMs)}ms` });
  if (row.validBidMs !== undefined) sections.push({ label: 'Time to usable bid', content: `${fmt(row.validBidMs)}ms` });
  if (row.predictorCollateral) sections.push({ label: 'Predictor collateral', content: `${fmtWei(row.predictorCollateral)} USDe` });
  if (row.estimatorCollateral) {
    sections.push({ label: 'Estimator collateral', content: `${fmtWei(row.estimatorCollateral)} USDe` });
    if (row.predictorCollateral) sections.push({ label: 'Estimator implied chance', content: `${impliedChance(row.predictorCollateral, row.estimatorCollateral)}%` });
  }
  if (row.usableCollateral) {
    sections.push({ label: 'Usable collateral', content: `${fmtWei(row.usableCollateral)} USDe` });
    if (row.predictorCollateral) sections.push({ label: 'Usable implied chance', content: `${impliedChance(row.predictorCollateral, row.usableCollateral)}%` });
  }
  if (row.error) sections.push({ label: 'Error', content: row.error });
  if (row.validationError) sections.push({ label: 'Validation error', content: row.validationError });

  // Expected vs actual quote comparison
  const expected = row.picks?.length && row.predictorCollateral
    ? computeExpectedQuote(row.picks, row.predictorCollateral)
    : null;

  return (
    <dialog ref={dialogRef} className="query-dialog" onClose={onClose} onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}>
      <div className="query-dialog-content">
        <div className="query-dialog-header">
          <span className={`log-badge ${row.state === 'error' ? 'badge-error' : row.state === 'validated' ? 'badge-success' : 'badge-pending'}`}>
            {row.state.toUpperCase()}
          </span>
          <span>{row.id}</span>
          <button className="query-dialog-close" onClick={onClose}>x</button>
        </div>
        <div className="auction-dialog-fields">
          {sections.map((s) => (
            <div key={s.label} className="auction-dialog-row">
              <span className="auction-dialog-label">{s.label}</span>
              <span className="auction-dialog-value">{s.content}</span>
            </div>
          ))}
        </div>
        {row.picks && row.picks.length > 0 && (
          <div className="query-dialog-section">
            <h5>Picks ({row.picks.length})</h5>
            <div className="picks-list">
              {row.picks.map((p, i) => <PickCard key={i} pick={p} />)}
            </div>
            {expected && (
              <div className="expected-vs-actual">
                <div className="expected-row">
                  <span className="expected-label">Combo probability (Polymarket)</span>
                  <span className="expected-value">{fmt(expected.comboProb * 100, 1)}%</span>
                </div>
                <div className="expected-row">
                  <span className="expected-label">Expected counterparty collateral</span>
                  <span className="expected-value">{fmtWei(String(Math.round(expected.expectedCounterpartyWei)))} USDe</span>
                </div>
                {row.usableCollateral && (
                  <>
                    <div className="expected-row">
                      <span className="expected-label">Actual (usable) collateral</span>
                      <span className="expected-value">{fmtWei(row.usableCollateral)} USDe</span>
                    </div>
                    <div className="expected-row">
                      <span className="expected-label">Difference</span>
                      {(() => {
                        const diff = (Number(row.usableCollateral) - expected.expectedCounterpartyWei) / 1e18;
                        const sign = diff >= 0 ? '+' : '-';
                        const abs = Math.abs(diff);
                        return (
                          <span className={`expected-value ${diff >= 0 ? 'diff-positive' : 'diff-negative'}`}>
                            {sign}{abs < 0.01 ? '<0.01' : abs.toFixed(2)} USDe
                          </span>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {row.rfqPayload && (
          <div className="query-dialog-section">
            <h5>RFQ Payload</h5>
            <pre>{JSON.stringify(row.rfqPayload, null, 2)}</pre>
          </div>
        )}
      </div>
    </dialog>
  );
}

export function RelayerBenchmark({ config, conditions }: Props) {
  const [wsUrl, setWsUrl] = useState(config.relayerWsUrl);
  const [privateKey, setPrivateKey] = useState('');
  const [intervalMs, setIntervalMs] = useState(2000);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [derivedAddress, setDerivedAddress] = useState('');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [anyBidStats, setAnyBidStats] = useState<Stats | null>(null);
  const [validBidStats, setValidBidStats] = useState<Stats | null>(null);
  const [filterExtremeOdds, setFilterExtremeOdds] = useState(false);

  const filteredConditions = useMemo(() => {
    if (!filterExtremeOdds) return conditions;
    return conditions.filter((c) => {
      if (c.estimatedPrice == null) return true;
      return c.estimatedPrice >= 0.01 && c.estimatedPrice <= 0.99;
    });
  }, [conditions, filterExtremeOdds]);

  const filteredConditionsRef = useRef(filteredConditions);
  useEffect(() => { filteredConditionsRef.current = filteredConditions; }, [filteredConditions]);

  const abortRef = useRef(false);
  const sessionRef = useRef<RelayerSession | null>(null);
  const startTimeRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const [inspecting, setInspecting] = useState<AuctionRow | null>(null);

  // Clear private key from memory on unmount
  useEffect(() => () => { setPrivateKey(''); }, []);

  useEffect(() => { if (!running) setWsUrl(config.relayerWsUrl); }, [config.relayerWsUrl, running]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [rows.length]);

  useEffect(() => {
    if (!derivedAddress) { setWalletInfo(null); return; }
    let cancelled = false;
    setWalletLoading(true);
    fetchWalletInfo(derivedAddress as Address, config)
      .then((info) => { if (!cancelled) setWalletInfo(info); })
      .catch(() => { if (!cancelled) setWalletInfo(null); })
      .finally(() => { if (!cancelled) setWalletLoading(false); });
    return () => { cancelled = true; };
  }, [derivedAddress, config]);

  const rebuildFromTimings = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const elapsed = performance.now() - startTimeRef.current;
    const newRows: AuctionRow[] = [];
    const anyBidSamples: { durationMs: number; success: boolean }[] = [];
    const validBidSamples: { durationMs: number; success: boolean }[] = [];

    session.timings.forEach((t: AuctionTiming, key: string) => {
      if (t.auctionId && key === t.auctionId) return;

      let state: AuctionState = 'pending';
      if (t.error) state = 'error';
      else if (t.firstValidBidAt) state = 'validated';
      else if (t.firstBidAt) state = 'bid';
      else if (t.ackAt) state = 'acked';

      newRows.push({
        id: key.slice(0, 8),
        sentAt: t.sentAt,
        state,
        ackMs: t.ackAt ? t.ackAt - t.sentAt : undefined,
        bidMs: t.firstBidAt ? t.firstBidAt - t.sentAt : undefined,
        validBidMs: t.firstValidBidAt ? t.firstValidBidAt - t.sentAt : undefined,
        estimatorBidMs: t.firstEstimatorBidAt ? t.firstEstimatorBidAt - t.sentAt : undefined,
        validating: t.validating,
        error: t.error,
        validationError: t.validationError,
        pickCount: t.pickCount,
        predictorCollateral: t.predictorCollateral,
        estimatorCollateral: t.estimatorCollateral,
        usableCollateral: t.usableCollateral,
        rfqPayload: t.rfqPayload as unknown as Record<string, unknown>,
        auctionId: t.auctionId,
        picks: t.picks,
      });

      // Any bid stats
      if (t.firstBidAt) {
        anyBidSamples.push({ durationMs: t.firstBidAt - t.sentAt, success: true });
      } else if (t.error) {
        anyBidSamples.push({ durationMs: (t.ackAt ?? performance.now()) - t.sentAt, success: false });
      }

      // Valid bid stats
      if (t.firstValidBidAt) {
        validBidSamples.push({ durationMs: t.firstValidBidAt - t.sentAt, success: true });
      } else if (t.firstBidAt && !t.validating) {
        // Had a bid but validation didn't pass
        validBidSamples.push({ durationMs: t.firstBidAt - t.sentAt, success: false });
      }
    });

    newRows.sort((a, b) => a.sentAt - b.sentAt);
    setRows([...newRows]);
    setAnyBidStats(computeStats(anyBidSamples, elapsed));
    setValidBidStats(computeStats(validBidSamples, elapsed));
  }, []);

  const handleKeyChange = (val: string) => {
    setPrivateKey(val);
    try {
      if (val.startsWith('0x') && val.length === 66) {
        setDerivedAddress(createSigner(val as Hex).address);
      } else { setDerivedAddress(''); }
    } catch { setDerivedAddress(''); }
  };

  const handleStart = async () => {
    if (!privateKey) { setStatus('Enter a private key'); return; }
    if (filteredConditions.length === 0) {
      setStatus(conditions.length === 0 ? 'No conditions — start GQL first' : 'No conditions match filter');
      return;
    }

    abortRef.current = false;
    startTimeRef.current = performance.now();
    setRunning(true);
    setAnyBidStats(null);
    setValidBidStats(null);
    setRows([]);

    const signer = createSigner(privateKey as Hex);
    const publicClient = createSessionPublicClient(config);

    const connect = async (): Promise<WebSocket> => {
      setStatus('Connecting...');
      const ws = await connectWs(wsUrl);
      setStatus(`Running (${filteredConditionsRef.current.length} conditions)`);
      return ws;
    };

    try {
      let ws = await connect();

      const session: RelayerSession = {
        ws, signer, config, publicClient,
        balanceWei: walletInfo?.balanceWei,
        timings: new Map(),
        onUpdate: rebuildFromTimings,
      };
      sessionRef.current = session;
      setupMessageHandler(session);

      // Auto-reconnect on drop
      const attachReconnect = () => {
        session.ws.onclose = async () => {
          if (abortRef.current) return;
          setStatus('Reconnecting...');
          for (let attempt = 1; attempt <= 5; attempt++) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            if (abortRef.current) return;
            try {
              ws = await connect();
              session.ws = ws;
              setupMessageHandler(session);
              attachReconnect();
              return;
            } catch {
              setStatus(`Reconnect attempt ${attempt}/5 failed`);
            }
          }
          setStatus('WebSocket disconnected (5 retries exhausted)');
          setRunning(false);
        };
      };
      attachReconnect();

      while (!abortRef.current) {
        if (session.ws.readyState !== WebSocket.OPEN) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        try {
          const picks = buildRandomPicks(filteredConditionsRef.current);
          if (picks.length > 0) await sendAuction(session, picks);
        } catch (err) {
          setStatus(`Send error: ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
      setRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setRunning(false);
    setStatus('Stopped');
    const session = sessionRef.current;
    if (session?.ws.readyState === WebSocket.OPEN) session.ws.close();
  };

  const requested = rows.length;
  const withAnyBid = rows.filter((r) => r.state === 'bid' || r.state === 'validated').length;
  const withValidBid = rows.filter((r) => r.state === 'validated').length;
  const pending = rows.filter((r) => r.state === 'pending' || r.state === 'acked').length;
  const errors = rows.filter((r) => r.state === 'error').length;
  const validating = rows.filter((r) => r.validating).length;

  return (
    <div className="benchmark-column">
      <h2>Relayer Benchmark</h2>

      <div className="controls">
        <label>
          Relayer WS URL
          <input type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} disabled={running} />
        </label>
        <label>
          Private Key
          <input type="password" value={privateKey} onChange={(e) => handleKeyChange(e.target.value)} disabled={running} placeholder="0x..." autoComplete="off" data-1p-ignore data-lpignore="true" />
          <span className="key-hint">
            Private key used to sign requests, verifying identity. Use{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); if (!running) handleKeyChange('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); }}>
              any on staging
            </a>.
          </span>
        </label>
        {derivedAddress && (
          <div className="wallet-info">
            <div className="wallet-header">
              <code>{derivedAddress}</code>
              <span className="wallet-balance">
                {walletLoading ? '...' : walletInfo ? `${fmtUsde(walletInfo.balance)} USDe` : ''}
              </span>
            </div>
          </div>
        )}
        <label>
          Interval (ms)
          <input type="number" min={500} max={30000} step={500} value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} disabled={running} />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={filterExtremeOdds}
            onChange={(e) => setFilterExtremeOdds(e.target.checked)}
          />
          <span>Exclude conditions with odds &lt;1% or &gt;99%</span>
        </label>
        <button onClick={running ? handleStop : handleStart} className={running ? 'btn-stop' : 'btn-start'} disabled={!running && filteredConditions.length === 0}>
          {running ? 'Stop' : conditions.length === 0 ? 'Start GQL first' : filteredConditions.length === 0 ? 'No conditions match filter' : 'Start'}
        </button>
        {conditions.length > 0 && (
          <span className="condition-count">
            {filterExtremeOdds
              ? `${filteredConditions.length} / ${conditions.length} conditions in pool`
              : `${conditions.length} conditions in pool`}
          </span>
        )}
      </div>

      {status && <div className="status">{status}</div>}

      {/* Hero metrics — two columns: any bid | usable bid */}
      {requested > 0 && (
        <div className="hero-stats hero-stats-2col">
          <div className="hero-stat">
            <span className="hero-value" style={{ color: withAnyBid / requested >= 0.95 ? '#44cc66' : withAnyBid / requested >= 0.8 ? '#ccaa44' : '#ee5555' }}>
              {fmt((withAnyBid / requested) * 100, 1)}<span className="hero-unit">%</span>
            </span>
            <span className="hero-label">Receive Any Bid</span>
            <span className="hero-detail">{withAnyBid} / {requested} (incl. estimates)</span>
            <span className="hero-sub">
              {anyBidStats && anyBidStats.successes > 0 ? <>{fmt(anyBidStats.avg)}ms avg. response time</> : '—'}
            </span>
          </div>
          <div className="hero-stat">
            <span className="hero-value" style={{ color: requested > 0 ? (withValidBid / requested >= 0.95 ? '#44cc66' : withValidBid / requested >= 0.8 ? '#ccaa44' : '#ee5555') : '#555' }}>
              {requested > 0 ? <>{fmt((withValidBid / requested) * 100, 1)}<span className="hero-unit">%</span></> : '—'}
            </span>
            <span className="hero-label">Receive Usable Bid</span>
            <span className="hero-detail">{withValidBid} / {requested} passed tier 2</span>
            <span className="hero-sub">
              {validBidStats && validBidStats.successes > 0 ? <>{fmt(validBidStats.avg)}ms avg. response time</> : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Latency breakdowns */}
      {anyBidStats && anyBidStats.successes > 0 && (
        <div className="latency-breakdowns">
          <div className="latency-section">
            <span className="latency-title">Any Bid</span>
            <span>Min {fmt(anyBidStats.min)}</span>
            <span>P50 {fmt(anyBidStats.p50)}</span>
            <span>P95 {fmt(anyBidStats.p95)}</span>
            <span>P99 {fmt(anyBidStats.p99)}</span>
            <span>Max {fmt(anyBidStats.max)}</span>
          </div>
          {validBidStats && validBidStats.successes > 0 && (
            <div className="latency-section">
              <span className="latency-title">Usable</span>
              <span>Min {fmt(validBidStats.min)}</span>
              <span>P50 {fmt(validBidStats.p50)}</span>
              <span>P95 {fmt(validBidStats.p95)}</span>
              <span>P99 {fmt(validBidStats.p99)}</span>
              <span>Max {fmt(validBidStats.max)}</span>
            </div>
          )}
        </div>
      )}

      {/* Counters */}
      {requested > 0 && (
        <div className="secondary-counters">
          {validating > 0 && <span>Validating: {validating}</span>}
          <span>Pending: {pending}</span>
          <span>Errors: {errors}</span>
        </div>
      )}

      {/* Auction log */}
      <div className="request-log" ref={logRef}>
        {rows.slice(-100).map((row) => (
          <div key={row.id} className="auction-row log-clickable" onClick={() => setInspecting(row)}>
            <span className="auction-id">{row.id}</span>
            {row.pickCount && <span className="auction-picks">{row.pickCount}p</span>}
            {row.predictorCollateral && (
              <span className="auction-amount">{fmtWei(row.predictorCollateral)}</span>
            )}
            <span className="auction-phase phase-sent">REQ</span>
            <span className="auction-arrow">→</span>
            {row.state === 'error' ? (
              <span className="auction-phase phase-error">ERR: {row.error}</span>
            ) : row.state === 'pending' ? (
              <span className="auction-phase phase-pending">waiting...</span>
            ) : (
              <>
                <span className="auction-phase phase-ack">ACK {row.ackMs !== undefined ? `${fmt(row.ackMs)}ms` : ''}</span>
                <span className="auction-arrow">→</span>
                {row.state === 'acked' ? (
                  <span className="auction-phase phase-pending">{row.validating ? 'validating...' : 'waiting for bid...'}</span>
                ) : (
                  <>
                    {row.estimatorBidMs != null && (
                      <>
                        <span className="auction-phase phase-estimator">
                          EST {row.estimatorCollateral && `${fmtWei(row.estimatorCollateral)} `}
                          {row.predictorCollateral && row.estimatorCollateral && (
                            <span className="auction-chance">({impliedChance(row.predictorCollateral, row.estimatorCollateral)}%)</span>
                          )}
                          {' '}{fmt(row.estimatorBidMs)}ms
                        </span>
                        <span className="auction-arrow">→</span>
                      </>
                    )}
                    {row.validBidMs != null ? (
                      <span className="auction-phase phase-valid">
                        USABLE {row.usableCollateral && `${fmtWei(row.usableCollateral)} `}
                        {row.predictorCollateral && row.usableCollateral && (
                          <span className="auction-chance">({impliedChance(row.predictorCollateral, row.usableCollateral)}%)</span>
                        )}
                        {' '}{fmt(row.validBidMs)}ms
                      </span>
                    ) : (
                      <span className="auction-phase phase-pending" title={row.validationError}>
                        {row.validating ? 'validating...' : row.validationError ? `failed: ${row.validationError.slice(0, 40)}` : 'waiting...'}
                      </span>
                    )}
                  </>
                )}
              </>
            )}
            <button className="log-query-btn" onClick={(e) => { e.stopPropagation(); setInspecting(row); }}>INFO</button>
          </div>
        ))}
      </div>
      {inspecting && <AuctionDialog row={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}
