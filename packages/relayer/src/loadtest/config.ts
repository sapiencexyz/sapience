/**
 * Load test configuration: types, defaults, and scale presets.
 */

export interface ScalePreset {
  connections: number;
  concurrentAuctions: number;
  bidsPerAuction: number;
  httpConcurrency: number;
}

export const SCALE_PRESETS: Record<number, ScalePreset> = {
  1: {
    connections: 10,
    concurrentAuctions: 5,
    bidsPerAuction: 2,
    httpConcurrency: 5,
  },
  10: {
    connections: 100,
    concurrentAuctions: 50,
    bidsPerAuction: 10,
    httpConcurrency: 20,
  },
  100: {
    connections: 500,
    concurrentAuctions: 200,
    bidsPerAuction: 20,
    httpConcurrency: 50,
  },
};

export interface LoadTestConfig {
  scenario: string;
  target: string;
  apiUrl: string;
  scale: number;
  duration: number; // seconds
  rampUp: number; // seconds
  metricsUrl?: string;
  confirmProduction: boolean;
  preset: ScalePreset;
  /**
   * Optional path for the JSON run report. Scenarios write a structured
   * summary here at the end of the run; absence skips the file write.
   * Use `jq` to diff two runs.
   */
  reportPath?: string;
  /**
   * Optional path for per-request JSONL log (one line per HTTP request
   * with requestId, latency, status, layer). Lets post-run analysis
   * join client timing to server `gql_request` lines by `requestId`.
   */
  requestLogPath?: string;
}

export function getPreset(scale: number): ScalePreset {
  return (
    SCALE_PRESETS[scale] ?? {
      connections: Math.round(10 * scale),
      concurrentAuctions: Math.round(5 * scale),
      bidsPerAuction: Math.max(2, Math.round(2 * Math.sqrt(scale))),
      httpConcurrency: Math.round(5 * scale),
    }
  );
}

export function isProductionUrl(url: string): boolean {
  return url.includes('sapience.xyz') || url.includes('ethereal.trade');
}
