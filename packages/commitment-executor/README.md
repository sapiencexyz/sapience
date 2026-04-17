# @sapience/commitment-executor

Keeper service that races the relayer's committed-intent mirror feed to execute
`CommittedIntentExecutor.execute()` (during window T2) and to sweep-expire
commitments whose deadline has passed. Modeled on `@sapience/market-keeper` but
runs as a long-lived process — it maintains in-memory state of every live
commitment it has observed and submits on-chain calls when a profitable walk is
feasible.

The mere presence of this service in an environment is the
`COMMITTED_INTENT_ENABLED` feature flag: where it is not deployed, no keeper
races for T2 executions, and only predictors themselves can execute in T1.

See `prd-001-committed-intent.md` §4.1/4.5/4.6/4.7 and
`prd-001-spec-0.1-canonical.md` §1.3/§1.9/§4 for the flow it mirrors.

## Environment

| Var                                 | Required | Default                | Purpose                                                           |
| ----------------------------------- | -------- | ---------------------- | ----------------------------------------------------------------- |
| `EXECUTOR_PRIVATE_KEY`              | yes      | —                      | Hot key used to sign `execute()` / `expire()` txs.                |
| `CHAIN_ID`                          | yes      | —                      | Chain the `CommittedIntentExecutor` is deployed on.               |
| `RPC_URL`                           | yes      | —                      | JSON-RPC endpoint.                                                |
| `RELAYER_WS_URL`                    | yes      | —                      | WebSocket URL of the relayer mirror feed.                         |
| `COMMITTED_INTENT_EXECUTOR_ADDRESS` | yes      | —                      | Deployed executor contract.                                       |
| `TIP_RECIPIENT`                     | no       | executor's own address | Where tips are credited on successful execute.                    |
| `MIN_PROFITABLE_TIP`                | no       | `0`                    | Skip execute if `executorTip - gasEstimate < MIN_PROFITABLE_TIP`. |
| `EXPIRE_SWEEP_INTERVAL_MS`          | no       | `15000`                | Cadence of the deadline sweep.                                    |
| `RANK_DEBOUNCE_MS`                  | no       | `500`                  | Wait this long after a quote arrives before ranking.              |
| `MAX_ATTEMPTS_PER_COMMITMENT`       | no       | `3`                    | Bound on retries after a reverted execute.                        |
| `LOG_LEVEL`                         | no       | `info`                 | `debug` / `info` / `warn` / `error`.                              |
| `METRICS_PORT`                      | no       | `9464`                 | Prometheus scrape endpoint.                                       |
| `HEALTH_PORT`                       | no       | `8080`                 | Exposes `/health` and `/health/ready`.                            |

## Run

```bash
pnpm -C packages/commitment-executor build
pnpm -C packages/commitment-executor start
```

For local development: `pnpm -C packages/commitment-executor dev`.

## Tests

```bash
pnpm -C packages/commitment-executor test
```
