# Settlement

Three settlement scripts run as separate cron stages — one per resolver type. They are the most operationally consequential things `market-keeper` does. All three follow the same shape: query the API for ended unsettled conditions, check on-chain state to skip already-settled ones, then write resolution data on-chain.

| Script              | Resolver                             | Chain                | When                 |
| ------------------- | ------------------------------------ | -------------------- | -------------------- |
| `settle-polymarket` | `ConditionalTokensConditionResolver` | Mainnet (`5064014`)  | Production           |
| `settle-pyth`       | `PythConditionResolver`              | Both                 | Production + staging |
| `settle-manual`     | `ManualConditionResolver`            | Testnet (`13374202`) | Staging only         |

## Selection logic

`scripts/start.js` picks one of `settle-polymarket` or `settle-manual` per environment based on `DEFAULT_CHAIN_ID`:

```js
if (process.env.DEFAULT_CHAIN_ID === '5064014') {
  run('node dist/scripts/settle-polymarket.js --execute --wait');
} else {
  run('node dist/scripts/settle-manual.js --execute --wait');
}

run('node dist/scripts/settle-pyth.js --execute --wait');
```

Pyth runs in both — Pyth-resolved conditions exist on both chains and don't depend on Polymarket. The polymarket-vs-manual split exists because Polymarket's ConditionalTokens infrastructure only lives on Polygon mainnet — there is no testnet bridge to Ethereal testnet, so testnet conditions get resolved manually.

## settle-polymarket (production)

Bridges resolution data from Polymarket on Polygon to Ethereal mainnet via LayerZero.

1. Query GraphQL for ended unsettled conditions whose resolver is `ConditionalTokensConditionResolver`.
2. For each condition, look up the Polygon `ConditionalTokensReader` ↔ Ethereal `ConditionalTokensConditionResolver` pair via `getConditionalTokensPairs(chainId)` in the SDK. There can be multiple legacy pairs; the script tries the current one first and falls back to legacy readers for older conditions.
3. Call `requestResolution(conditionId)` on the Polygon reader. The reader reads the on-chain payout from the Gnosis CT framework and emits a LayerZero message that mints settlement on Ethereal.
4. The on-chain LZ delivery happens asynchronously — typically within minutes of the request transaction confirming. The script's `--wait` flag waits for the _Polygon_ tx confirmation only, not the LZ delivery.

**POL gas requirement.** Each LayerZero call costs roughly **0.65 POL** in fees on Polygon. The admin wallet that signs `requestResolution` calls must hold POL — this is a recurring funding requirement, easy to forget. If the wallet runs out, settlements stall silently.

## settle-pyth

Pulls signed price updates from Pyth Lazer for each ended Pyth-resolved condition and submits them on-chain. Self-contained — no LayerZero bridge.

Per-condition flow:

1. Parse market parameters (price feed, threshold, comparison) from the condition `description` field. The encoding is part of the protocol; see `src/llm/prompts.ts` for the canonical format used at generation time.
2. Fetch a signed Pyth Lazer payload covering the resolution timestamp.
3. Call `settleCondition` on `PythConditionResolver` with the payload.

**Pyth Lazer auth.** Requires `PYTH_CONSUMER_TOKEN`. Script no-ops cleanly (logs and exits 0) if the token is missing — useful for environments that haven't been provisioned yet, but means a missing token in production silently disables Pyth settlement. Verify the token is set in production env.

## settle-manual (staging)

Staging/testnet pipeline for conditions where the resolver is `ManualConditionResolver`. It uses Polymarket/Gamma REST outcomes and writes directly on Ethereal testnet; unlike `settle-polymarket`, it does not call Polygon `ConditionalTokensReader` or LayerZero. Staging-only. Refuses to run if the resolver address doesn't match `ManualConditionResolver` — a guardrail to prevent accidentally pointing it at production.

## Idempotency

All three scripts re-check on-chain state before writing. A condition that has already been settled (anyone — not just this keeper instance) is skipped. This makes the cron safe to retry and safe to run from multiple instances, though concurrent execution wastes RPC calls.

There is no transaction-level deduplication — if two instances race to settle the same condition simultaneously, the second tx will revert when it tries to write to an already-settled condition. The scripts treat reverts as benign (logged, not retried within the run).

## Failure modes worth knowing

- **Polygon RPC outages** halt `settle-polymarket` because it depends on reading Polygon state. `settle-manual` uses Polymarket/Gamma REST plus Ethereal writes instead. The cron retries on the next pipeline run; no manual intervention needed unless the outage exceeds several pipeline cycles.
- **POL exhaustion** silently stops settling. There is no current alert for low admin-wallet POL balance — flag for ops.
- **LayerZero message stuck in flight.** The Polygon-side request confirms but Ethereal never receives the resolution. Rare; manual diagnosis via the LayerZero scan UI. There is no script-level retry for stuck messages.
- **Pyth Lazer staleness.** If the requested timestamp is too old, Pyth returns an error and the script logs but does not raise. Check the cron logs after each run.

## Where to look in code

| File                                  | Notes                                                         |
| ------------------------------------- | ------------------------------------------------------------- |
| `scripts/start.js`                    | Pipeline orchestration, chain-based selection                 |
| `scripts/settle-polymarket.ts`        | Polygon → LayerZero → Ethereal flow                           |
| `scripts/settle-pyth.ts`              | Pyth Lazer fetch + on-chain submit                            |
| `scripts/settle-manual.ts`            | Testnet manual resolution                                     |
| `src/polymarket-api.ts`               | `batchCheckGammaResolution` — Polymarket REST integration     |
| `packages/sdk/contracts/addresses.ts` | `getConditionalTokensPairs(chainId)` — current + legacy pairs |
