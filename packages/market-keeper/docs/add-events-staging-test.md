# add-events: staging test plan

`scripts/add-events.ts` manually ingests specific Polymarket events by slug,
bypassing the 21-day end-date window the `generate` cron uses. After the parity
fix it shares the cron's processing: it re-fetches the event's markets through
the canonical `/markets` endpoint, applies the same active/open + binary
filters, and only then runs `groupMarkets` → `submitToAPI`.

Use this checklist to validate against **staging** before touching production.

## What the fix changed (and what to look for)

| #   | Gap closed                                                          | Observable signal                                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | active/closed/archived filter                                       | resolved/eliminated basket legs are NOT created                           |
| 2   | binary `MARKET_FILTERS`                                             | non-binary markets are dropped                                            |
| 3   | canonical `/markets` shape (`seriesSlug`/`series`, `gameStartTime`) | sports `endTime` comes from game/series, not the Polymarket+1day fallback |
| 4   | `confirmProductionAccess()`                                         | a y/N prompt fires for `api.sapience.xyz` (not for staging)               |
| 5   | `sapience-conditions.json` artifact                                 | the file is written on every run, incl. `--dry-run`                       |
| 6   | dedup by conditionId                                                | passing overlapping slugs creates no duplicates                           |

negRisk was already handled (market-level `negRisk`/`negRiskMarketID` survive)
and is covered by a regression test; verify it still lands (Phase 3).

## Environment (mirror the staging keeper)

```bash
export SAPIENCE_API_URL=https://api.staging.sapience.xyz
export CHAIN_ID=<ethereal-testnet-id>        # the value the staging keeper uses
export RESOLVER_ADDRESS=0x9938583eA9a6450Cc64502bDcBF76f4EEa2F9560   # ManualConditionResolver (testnet)
export ADMIN_PRIVATE_KEY=<staging admin key>
export NODE_ENV=development
export LLM_ENABLED=false                      # staging keeper runs LLM off → deterministic
```

`confirmProductionAccess` only prompts when the URL contains the contiguous
string `api.sapience.xyz`, so `api.staging.sapience.xyz` never prompts — safe to
run unattended.

## Phase 0 — Local gates

```bash
pnpm --filter @sapience/sdk run build:lib          # SDK builds first
pnpm --filter @sapience/market-keeper run type-check
pnpm --filter @sapience/market-keeper run lint
pnpm --filter @sapience/market-keeper run test     # incl. from-event-slugs + negRisk tests
```

## Phase 1 — Dry-run inspection (no writes)

Pick events that each exercise a gap:

- a negRisk basket with dead legs (e.g. `2026-nba-champion`) → gaps 1, 6, negRisk
- a sports game event with `gameStartTime` → gap 3
- (best-effort) an event containing a non-binary market → gap 2

```bash
pnpm --filter @sapience/market-keeper run add-events:dry-run 2026-nba-champion
```

Inspect the printed output **and** `packages/market-keeper/sapience-conditions.json`:

- only binary, active, open legs present (closed/eliminated legs gone);
- each basket condition has `negRisk: true` + a shared `negRiskMarketId`, and the group carries `negRiskMarketId`;
- sports `endTime` derives from gameStartTime/series, not Polymarket end + 1 day;
- `optionName` (= `groupItemTitle`), `categorySlug`, `externalEventId` populated.

## Phase 1b — Parity proof vs `generate`

Pick an event that ALSO falls inside generate's 21-day window. With
`LLM_ENABLED=false` (deterministic), run both and diff that event's entries:

```bash
pnpm --filter @sapience/market-keeper run generate:dry-run        # writes sapience-conditions.json
cp packages/market-keeper/sapience-conditions.json /tmp/from-generate.json
pnpm --filter @sapience/market-keeper run add-events:dry-run <that-event-slug>
# diff the group/conditions for <that-event-slug> across the two JSON files — expect identical
```

## Phase 2 — Submit to staging

```bash
pnpm --filter @sapience/market-keeper run add-events <slug>       # no --dry-run; no prod prompt on staging URL
```

## Phase 3 — Verify in staging

Query the staging API for the created group (by `externalEventId`) and its
conditions (by `conditionHash`) and assert:

- `group.negRisk == true` for a basket;
- per-condition `endTime`, `categorySlug`, `chainId == <testnet>`, `resolver`, `optionName` correct;
- the event renders as a grouped market in the staging UI (if available).

## Phase 4 — Idempotency

Re-run the same command. Expect existing conditions skipped (409 handled), no
duplicate groups, and no cross-slug duplicates.

## Phase 5 — Edge cases

- Event whose legs are all closed → nothing created.
- Bogus slug → graceful warning, non-zero exit, no partial writes.
- Multiple slugs including an overlap → no duplicates.

## Phase 6 — Production

```bash
SAPIENCE_API_URL=https://api.sapience.xyz pnpm --filter @sapience/market-keeper run add-events:dry-run <slug>   # inspect first
SAPIENCE_API_URL=https://api.sapience.xyz pnpm --filter @sapience/market-keeper run add-events <slug>           # confirmProductionAccess prompts → y
```
