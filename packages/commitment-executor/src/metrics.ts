/**
 * Prometheus metrics exported by the keeper. Follows the same
 * prom-client pattern as packages/relayer/src/metrics.ts.
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const register = new Registry();

register.setDefaultLabels({ app: 'commitment-executor' });

export const commitmentsObserved = new Counter({
  name: 'commitment_executor_commitments_observed_total',
  help: 'Total number of `commitment.created` events consumed from the relayer feed.',
  registers: [register],
});

export const quotesObserved = new Counter({
  name: 'commitment_executor_quotes_observed_total',
  help: 'Total number of `commitment.quote` events consumed from the relayer feed.',
  registers: [register],
});

export const executionsAttempted = new Counter({
  name: 'commitment_executor_executions_attempted_total',
  help: 'Total number of execute() attempts made by the keeper.',
  labelNames: ['status'], // 'success' | 'reverted' | 'rpc_error' | 'skipped'
  registers: [register],
});

export const expirationsAttempted = new Counter({
  name: 'commitment_executor_expirations_attempted_total',
  help: 'Total number of expire() attempts made by the keeper.',
  labelNames: ['status'], // 'success' | 'reverted' | 'rpc_error'
  registers: [register],
});

export const gasPaid = new Histogram({
  name: 'commitment_executor_gas_paid_wei',
  help: 'Gas (in wei) paid on successful execute()/expire() transactions.',
  buckets: [
    1e14, 5e14, 1e15, 5e15, 1e16, 5e16, 1e17, 5e17, 1e18, 5e18, 1e19, 5e19,
  ],
  labelNames: ['kind'], // 'execute' | 'expire'
  registers: [register],
});

export const tipEarned = new Histogram({
  name: 'commitment_executor_tip_earned_wei',
  help: 'Executor tip (in wei) credited to the keeper on successful execute().',
  buckets: [0, 1e15, 1e16, 1e17, 1e18, 5e18, 1e19, 5e19, 1e20],
  registers: [register],
});

export const liveCommitments = new Gauge({
  name: 'commitment_executor_live_commitments',
  help: 'Number of commitments the keeper is currently tracking in memory.',
  registers: [register],
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
