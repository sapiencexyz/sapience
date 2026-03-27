/**
 * GraphQL HTTP driver with concurrency control and status code tracking.
 */

import { Semaphore } from './semaphore';
import type { MetricsCollector } from './metrics';

export interface HttpDriverStats {
  total: number;
  success: number;
  status429: number;
  status503: number;
  otherErrors: number;
}

export class HttpDriver {
  private semaphore: Semaphore;
  private stats: HttpDriverStats = {
    total: 0,
    success: 0,
    status429: 0,
    status503: 0,
    otherErrors: 0,
  };

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
   * Execute a GraphQL query with concurrency control and latency tracking.
   */
  async query(
    queryString: string,
    metricName: string,
    variables?: Record<string, unknown>
  ): Promise<{ status: number; data?: unknown; error?: string }> {
    return this.semaphore.run(async () => {
      this.stats.total++;
      const start = Date.now();

      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryString, variables }),
        });

        const latency = Date.now() - start;
        this.metrics.record(`http_${metricName}`, latency);

        if (res.status === 429) {
          this.stats.status429++;
          return { status: 429, error: 'rate limited' };
        }
        if (res.status === 503) {
          this.stats.status503++;
          return { status: 503, error: 'service unavailable' };
        }
        if (!res.ok) {
          this.stats.otherErrors++;
          return { status: res.status, error: `HTTP ${res.status}` };
        }

        this.stats.success++;
        const data = await res.json();
        return { status: res.status, data };
      } catch (err) {
        this.metrics.record(`http_${metricName}`, Date.now() - start);
        this.stats.otherErrors++;
        return {
          status: 0,
          error: err instanceof Error ? err.message : 'unknown error',
        };
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
  ): Promise<{ status: number; data?: unknown; error?: string }[]> {
    const promises: Promise<{
      status: number;
      data?: unknown;
      error?: string;
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
