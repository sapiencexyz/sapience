import { useState, useRef, useCallback, useEffect } from 'react';
import { runGqlQuery, randomizeParams } from '../lib/gqlRunner';
import { computeStats, type Stats } from '../lib/stats';
import { StatsPanel } from './StatsPanel';
import { RequestLog, type LogEntry } from './RequestLog';
import type { EnvConfig } from '../lib/constants';

interface Props {
  config: EnvConfig;
  onQuestionsReceived?: (questions: unknown[]) => void;
}

export function GqlBenchmark({ config, onQuestionsReceived }: Props) {
  const [apiUrl, setApiUrl] = useState(config.gqlUrl);
  const [concurrency, setConcurrency] = useState(5);
  const [delayMs, setDelayMs] = useState(200);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [successStats, setSuccessStats] = useState<Stats | null>(null);
  const [failureStats, setFailureStats] = useState<Stats | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const abortRef = useRef(false);
  const samplesRef = useRef<{ durationMs: number; success: boolean }[]>([]);
  const logRef = useRef<LogEntry[]>([]);
  const startTimeRef = useRef(0);
  const lastConditionRefreshRef = useRef(0);

  // Sync URL when env changes (only when not running)
  useEffect(() => {
    if (!running) setApiUrl(config.gqlUrl);
  }, [config.gqlUrl, running]);

  const updateStats = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current;
    const all = samplesRef.current;
    setStats(computeStats(all, elapsed));

    const ok = all.filter((s) => s.success);
    const fail = all.filter((s) => !s.success);
    setSuccessStats(ok.length > 0 ? computeStats(ok, elapsed) : null);
    setFailureStats(fail.length > 0 ? computeStats(fail, elapsed) : null);

    setLog([...logRef.current]);
  }, []);

  const runLoop = useCallback(async (url: string, delay: number) => {
    while (!abortRef.current) {
      const params = randomizeParams();
      const result = await runGqlQuery(url, params);

      samplesRef.current.push({ durationMs: result.durationMs, success: result.success });
      logRef.current.push({
        timestamp: Date.now(),
        durationMs: result.durationMs,
        success: result.success,
        message: result.success ? `${result.itemCount} items` : result.error,
        variables: result.variables,
      });

      // Refresh conditions every 30s so the relayer picks from fresh data
      if (result.success && result.rawQuestions) {
        const now = Date.now();
        if (now - lastConditionRefreshRef.current >= 30_000) {
          lastConditionRefreshRef.current = now;
          onQuestionsReceived?.(result.rawQuestions);
        }
      }

      if (logRef.current.length > 200) {
        logRef.current = logRef.current.slice(-200);
      }

      updateStats();

      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }, [updateStats, onQuestionsReceived]);

  const handleStart = () => {
    abortRef.current = false;
    samplesRef.current = [];
    logRef.current = [];
    lastConditionRefreshRef.current = 0;
    startTimeRef.current = performance.now();
    setRunning(true);
    setStats(null);
    setSuccessStats(null);
    setFailureStats(null);
    setLog([]);

    for (let i = 0; i < concurrency; i++) {
      runLoop(apiUrl, delayMs);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setRunning(false);
  };

  return (
    <div className="benchmark-column">
      <h2>GQL API Benchmark</h2>

      <div className="controls">
        <label>
          API URL
          <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} disabled={running} />
        </label>
        <div className="control-row">
          <label>
            Concurrency
            <input type="number" min={1} max={50} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} disabled={running} />
          </label>
          <label>
            Delay (ms)
            <input type="number" min={0} max={10000} step={100} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} disabled={running} />
          </label>
        </div>

        <button onClick={running ? handleStop : handleStart} className={running ? 'btn-stop' : 'btn-start'}>
          {running ? 'Stop' : 'Start'}
        </button>
      </div>

      {stats && <StatsPanel stats={stats} label="All Requests" />}
      {(successStats || failureStats) && (
        <div className="stats-breakdown">
          {successStats && <StatsPanel stats={successStats} label="Successful" />}
          {failureStats && <StatsPanel stats={failureStats} label="Failed" />}
        </div>
      )}
      <RequestLog entries={log} />
    </div>
  );
}
