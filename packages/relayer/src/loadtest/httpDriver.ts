/**
 * GraphQL HTTP driver with concurrency control and per-operation stats.
 *
 * Each request is tagged with a generated `x-request-id` and the operation's
 * metricName as `x-operation-name`. The server reads both — the request id
 * lets server-side `gql_request` / `gql_shed` lines be joined back to this
 * driver's request log; the operation name lets the rate-limit layers log
 * which operation they rejected.
 *
 * Note: `x-operation-name` is fine here because we control the client. For
 * production observability of adversarial traffic, the server-side occupant
 * snapshot in concurrencyLimiter.ts is the trustworthy source.
 *
 * On a 429 the driver reads the body's `extensions.code` to determine which
 * layer fired (IP_RATE_LIMIT, IP_CONCURRENCY_EXCEEDED, SERVER_BUSY) and
 * buckets the rejection per-operation. The express-rate-limit fallback body
 * (in case the custom handler somehow doesn't return JSON) maps to
 * 'ip_rate_limit' as a sensible default since that layer is the only one
 * that runs before our concurrencyLimiter.
 */

import { randomUUID } from 'node:crypto';
import { Semaphore } from './semaphore';
import type { MetricsCollector } from './metrics';

export type ShedLayer = 'ip_rate_limit' | 'ip_concurrency' | 'global';

export interface OperationStats {
  total: number;
  success: number;
  shedByLayer: Record<ShedLayer, number>;
  status503: number;
  otherErrors: number;
}

export interface HttpDriverStats {
  total: number;
  success: number;
  status429: number;
  status503: number;
  otherErrors: number;
}

export interface RequestLogEntry {
  ts: number;
  requestId: string;
  metricName: string;
  status: number;
  layer?: ShedLayer;
  latencyMs: number;
  error?: string;
}

const newOperationStats = (): OperationStats => ({
  total: 0,
  success: 0,
  shedByLayer: { ip_rate_limit: 0, ip_concurrency: 0, global: 0 },
  status503: 0,
  otherErrors: 0,
});

const layerForCode = (code: string | undefined): ShedLayer | undefined => {
  if (code === 'IP_RATE_LIMIT') return 'ip_rate_limit';
  if (code === 'IP_CONCURRENCY_EXCEEDED') return 'ip_concurrency';
  if (code === 'SERVER_BUSY') return 'global';
  return undefined;
};

export class HttpDriver {
  private semaphore: Semaphore;
  private stats: HttpDriverStats = {
    total: 0,
    success: 0,
    status429: 0,
    status503: 0,
    otherErrors: 0,
  };
  private byOperation = new Map<string, OperationStats>();
  private requestLog: RequestLogEntry[] = [];

  constructor(
    private readonly apiUrl: string,
    concurrency: number,
    private readonly metrics: MetricsCollector
  ) {
    this.semaphore = new Semaphore(concurrency);
  }

  get driverStats(): HttpDriverStats {
    return { ...this.stats };
  }

  /**
   * Returns a snapshot of per-operation outcome counters. The reporter
   * uses this to render the per-operation breakdown table.
   */
  operationStats(): Map<string, OperationStats> {
    const out = new Map<string, OperationStats>();
    for (const [name, stats] of this.byOperation) {
      out.set(name, {
        ...stats,
        shedByLayer: { ...stats.shedByLayer },
      });
    }
    return out;
  }

  /**
   * Drain and return the per-request log accumulated so far. Scenarios
   * write this to a JSONL file at the end so post-run analysis can join
   * client timing to server `gql_request` lines by `requestId`.
   */
  drainRequestLog(): RequestLogEntry[] {
    const out = this.requestLog;
    this.requestLog = [];
    return out;
  }

  private opStats(metricName: string): OperationStats {
    let s = this.byOperation.get(metricName);
    if (!s) {
      s = newOperationStats();
      this.byOperation.set(metricName, s);
    }
    return s;
  }

  /**
   * Execute a GraphQL query with concurrency control and latency tracking.
   */
  async query(
    queryString: string,
    metricName: string,
    variables?: Record<string, unknown>
  ): Promise<{
    status: number;
    data?: unknown;
    error?: string;
    layer?: ShedLayer;
    requestId: string;
  }> {
    return this.semaphore.run(async () => {
      this.stats.total++;
      const op = this.opStats(metricName);
      op.total++;
      const requestId = randomUUID();
      const start = Date.now();

      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': requestId,
            'x-operation-name': metricName,
          },
          body: JSON.stringify({ query: queryString, variables }),
        });

        const latencyMs = Date.now() - start;
        this.metrics.record(`http_${metricName}`, latencyMs);

        if (res.status === 429) {
          this.stats.status429++;
          let layer: ShedLayer | undefined;
          try {
            const json = (await res.json()) as {
              errors?: Array<{ extensions?: { code?: string } }>;
            };
            layer = layerForCode(json.errors?.[0]?.extensions?.code);
          } catch {
            // Non-JSON body (e.g. legacy express-rate-limit default text).
            // Treat as ip_rate_limit since that's the only layer that can
            // emit a non-GraphQL body.
            layer = 'ip_rate_limit';
          }
          const bucket: ShedLayer = layer ?? 'ip_rate_limit';
          op.shedByLayer[bucket]++;
          this.requestLog.push({
            ts: Date.now(),
            requestId,
            metricName,
            status: 429,
            layer: bucket,
            latencyMs,
            error: 'rate limited',
          });
          return {
            status: 429,
            error: 'rate limited',
            layer: bucket,
            requestId,
          };
        }
        if (res.status === 503) {
          this.stats.status503++;
          op.status503++;
          this.requestLog.push({
            ts: Date.now(),
            requestId,
            metricName,
            status: 503,
            latencyMs,
            error: 'service unavailable',
          });
          return { status: 503, error: 'service unavailable', requestId };
        }
        if (!res.ok) {
          this.stats.otherErrors++;
          op.otherErrors++;
          this.requestLog.push({
            ts: Date.now(),
            requestId,
            metricName,
            status: res.status,
            latencyMs,
            error: `HTTP ${res.status}`,
          });
          return { status: res.status, error: `HTTP ${res.status}`, requestId };
        }

        this.stats.success++;
        op.success++;
        const data = await res.json();
        this.requestLog.push({
          ts: Date.now(),
          requestId,
          metricName,
          status: res.status,
          latencyMs,
        });
        return { status: res.status, data, requestId };
      } catch (err) {
        const latencyMs = Date.now() - start;
        this.metrics.record(`http_${metricName}`, latencyMs);
        this.stats.otherErrors++;
        op.otherErrors++;
        const error = err instanceof Error ? err.message : 'unknown error';
        this.requestLog.push({
          ts: Date.now(),
          requestId,
          metricName,
          status: 0,
          latencyMs,
          error,
        });
        return { status: 0, error, requestId };
      }
    });
  }

  /**
   * Fire N queries at controlled rate.
   */
  async burst(
    queryString: string,
    metricName: string,
    count: number,
    delayMs = 0
  ): Promise<
    {
      status: number;
      data?: unknown;
      error?: string;
      layer?: ShedLayer;
      requestId: string;
    }[]
  > {
    const promises: Promise<{
      status: number;
      data?: unknown;
      error?: string;
      layer?: ShedLayer;
      requestId: string;
    }>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(this.query(queryString, metricName));
      if (delayMs > 0 && i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return Promise.all(promises);
  }
}
