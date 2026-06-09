# Deployment Manifest

The manifest is the authoritative record of **which** contracts are deployed on
each chain, **how** they're deployed (forge script + dependencies), and **what
state** they're currently in (address, bytecode hash, deploy timestamp).

This directory implements the full deploy pipeline (Phases 1, 2, 3, 3b):

| Phase | Deliverable                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Schema, manifest files, and a populator that records the **current** state.                                                                                    |
| 2     | A `plan.ts` that diffs hashes vs the manifest and computes a redeploy set.                                                                                     |
| 3     | An `apply.ts` executor that runs the plan and writes state back after each step.                                                                               |
| 3b    | Pre-flight (forge build, salt, deployer validation), inline `--verify`, post-deploy hooks (SDK sync), `--bundle` isolation, and the deploy.sh -> pnpm cutover. |

The executor is the only piece that talks to RPCs. Everything else is local
manifest + artifact transcription. The pipeline is fully pnpm-driven —
the legacy `deploy.sh` was removed in favour of `manifest:plan`,
`manifest:apply`, `manifest:verify`, and `manifest:ops`.

## Layout

```
manifest/
├── schema.ts             # Types + runtime validator
├── populate.ts           # CLI: read current state and write into manifest
├── plan.ts               # CLI: diff artifacts vs manifest, emit a redeploy plan
├── apply.ts              # CLI: execute the plan via forge, persist state
├── verify.ts             # CLI: re-verify deployed contracts on each chain's explorer
├── ops.ts                # CLI: post-deploy ops (mint, bridge, resolve, retry, check-*)
├── sync-sdk.ts           # CLI: regenerate packages/sdk/contracts/addresses.ts
├── _shared/
│   ├── spawn.ts          # captureSpawn + cast/forge/git wrappers
│   └── env.ts            # config.json + .env loaders + writeConfigKey
├── env/
│   ├── ethereal-testnet.json
│   ├── arbitrum-sepolia.json
│   ├── ethereal-mainnet.json
│   ├── polygon.json
│   └── arbitrum.json
├── __tests__/
│   ├── schema.test.ts
│   ├── populate.test.ts
│   ├── plan.test.ts
│   ├── apply.test.ts
│   ├── verify.test.ts
│   ├── ops.test.ts
│   ├── sync-sdk.test.ts
│   └── shared.test.ts
└── README.md
```

## The five environments

| Env                | Bundle  | Chain            | Role                                            |
| ------------------ | ------- | ---------------- | ----------------------------------------------- |
| `ethereal-testnet` | testnet | Ethereal Testnet | PM Network (escrow, bridge, vault, sponsor, …)  |
| `arbitrum-sepolia` | testnet | Arbitrum Sepolia | SM Network — bridge remote, factory twin        |
| `ethereal-mainnet` | mainnet | Ethereal         | PM Network (mainnet)                            |
| `polygon`          | mainnet | Polygon          | CT Reader (Gnosis Conditional Tokens — mainnet) |
| `arbitrum`         | mainnet | Arbitrum One     | SM Network — bridge remote, factory twin        |

## Bundle isolation

**Testnet and mainnet are independent deployments.** Apply never operates
across both bundles at once.

- `assertCrossEnvRefs` rejects any `twinOf` or `wiringPeers` reference that
  crosses bundles. CREATE3 twin pairs and LZ peer pairs always live inside
  the same bundle: `ethereal-testnet ↔ arbitrum-sepolia` and
  `ethereal-mainnet ↔ arbitrum` (plus `ethereal-mainnet ↔ polygon` for CT).
- `manifest:apply` **requires** `--bundle <testnet|mainnet>`. The CLI
  errors out if it's missing.
- `manifest:plan` accepts `--bundle` as an optional filter. Without the
  flag it prints one section per bundle.
- `pnpm manifest:ops`, `manifest:apply`, `manifest:verify` all take
  `--bundle` directly. There's no shell wrapper anymore.

## Concepts

### Deploy unit

One deployable contract instance. Identified by a name unique within its
manifest (e.g. `PredictionMarketTokenFactory`). The same contract can be
deployed multiple times as distinct units (e.g. `PredictionMarketVault` is
deployed three times on mainnet under different names: the default vault, the
Pyth vault, and the Strategy-B vault).

### `constructorDeps` — intra-env

Other units in the **same manifest** whose addresses are read by this unit's
deploy script. Redeploying any of these forces a redeploy of this unit.

### `wiringPeers` — cross-env

Fully-qualified references to units in **other manifests** that this unit is
wired to post-deploy (LayerZero peers, CT reader↔resolver pair). Form:
`<env>:<UnitName>`. When a peer redeploys, this unit needs its
`configureScripts` re-run (no redeploy required, just reconfiguration).

### `twinOf` — CREATE3 mirror

Cross-env reference declaring that this unit and the twin **must share an
address** through CREATE3 (same salt + same deployer EOA on both chains).
Redeploying the twin **forces** this unit to redeploy too — the address would
otherwise diverge.

### `configureScripts`

Post-deploy scripts run automatically when:

- this unit deploys/redeploys, OR
- a `wiringPeer` redeploys (the peer needs to be re-pointed at us).

### `state` — populated by `populate.ts`

```ts
{
  address?: string;          // current on-chain address
  bytecodeHash?: string;     // sha256 of deployedBytecode.object (runtime code)
  creationCodeHash?: string; // sha256 of bytecode.object (creation code)
  gitSha?: string;
  deployedAt?: string;       // ISO-8601
  txHash?: string;
  salt?: string;             // CREATE3 salt (for twin units)
}
```

The hash is **sha256**, not keccak256. We only need a deterministic change
signal; we don't compute on-chain addresses from this. The planner compares
these against freshly-built artifacts.

### `sdkExport` — fallback address source

Each unit may declare `sdkExport: "<chainAddressMapName>"`. When populating,
the executor will read the matching export from
`packages/sdk/contracts/addresses.ts` (keyed by `manifest.chain.chainId`) if
`<bundle>/config.json` doesn't carry the unit's address. This covers
resolvers and CT contracts that `deploy.sh` never wrote to `config.json` but
that are tracked in the SDK.

Lookup order during populate:

1. `state.address` already set in the manifest → keep it (preserves manual edits).
2. `<bundle>/config.json` lookup via the unit's `produces` keys.
3. `sdkExport` lookup against the SDK's `ChainAddressMap`.

Once an address is recorded in the manifest, populate is idempotent —
re-running it just refreshes `bytecodeHash` from the current forge build.

## Usage

### Populate from current state

```bash
# All four manifests
pnpm --filter @sapience/protocol run manifest:populate

# Just one
pnpm --filter @sapience/protocol run manifest:populate -- --env ethereal-testnet

# Preview without writing
pnpm --filter @sapience/protocol run manifest:populate -- --dry-run
```

Requires `forge build --ast` to have been run, so that `out/*.json` artifacts
exist (otherwise units will be flagged `ARTIFACT MISSING` in the report and
their bytecode hash stays empty).

### Plan a redeploy

```bash
# Human-readable plan (what would be redeployed and why)
pnpm --filter @sapience/protocol run manifest:plan

# Force a specific unit to redeploy (twins + dependents auto-propagate)
pnpm --filter @sapience/protocol run manifest:plan -- --force ethereal-testnet:PredictionMarketTokenFactory

# Machine-readable (for the future executor / CI gating)
pnpm --filter @sapience/protocol run manifest:plan -- --json

# CI gating: exit non-zero if there's any pending change
pnpm --filter @sapience/protocol run manifest:plan -- --check
```

### Planner algorithm (plain language)

1. **Seed dirty set**: for each unit, mark it dirty if its current bytecode
   hash differs from the recorded one, OR it has never been deployed
   (`state.address` missing), OR it was passed via `--force`.
2. **Propagate**:
   - `constructorDeps` cascade: any unit listing a dirty unit as a constructor
     dep becomes dirty (transitively).
   - `twinOf` cascade: if a unit is dirty and has a CREATE3 twin in another
     env, the twin becomes dirty too. `twinOf` is schema-enforced to be
     **symmetric** — both sides declare each other — which keeps the
     equivalence class strictly pairwise.
3. **Reconfigure set**: for each dirty unit, list its `wiringPeers`. Any peer
   not already in the dirty set needs to **reconfigure** (re-run its
   `configureScripts`), not redeploy.
4. **Order**: deploys come first, topologically sorted by `constructorDeps`
   within each env; configures run after all deploys.

### Worked example

Force a redeploy of the testnet factory:

```text
$ pnpm manifest:plan -- --force ethereal-testnet:PredictionMarketTokenFactory

# Deploys (in order):
  [arbitrum] PredictionMarketTokenFactory                 (twin of ethereal-testnet:Factory)
  [arbitrum] PredictionMarketBridgeRemote                 (depends on arbitrum:Factory)
  [ethereal-testnet] PredictionMarketTokenFactory         (forced via --force)
  [ethereal-testnet] PredictionMarketBridge               (depends on ethereal-testnet:Factory)
  [ethereal-testnet] PredictionMarketEscrow               (depends on ethereal-testnet:Factory)
  [ethereal-testnet] OnboardingSponsor                    (depends on ethereal-testnet:Escrow)

# Configures (after all deploys):
  [arbitrum] PredictionMarketBridgeRemote                 ConfigureRemoteBridge, SetDVN_RemoteBridge
  [ethereal-testnet] PredictionMarketTokenFactory         ConfigureFactory
  [ethereal-testnet] PredictionMarketBridge               ConfigureEtherealBridge, SetDVN_EtherealBridge
```

Forcing the testnet factory **does not** pull in `ethereal-mainnet` — the
mainnet manifest has no twin link to `arbitrum` (which currently targets
Sepolia and pairs with `ethereal-testnet`). Once a separate `arbitrum-mainnet`
manifest exists, mainnet's twin links can be re-added without affecting the
testnet bundle.

### Apply the plan

```bash
# Compute the plan and run it. Persists manifest + config.json after every
# successful item; halts on the first failure (use --continue-on-error to
# soldier on).
pnpm --filter @sapience/protocol run manifest:apply

# Dry-run: build the plan, validate env vars, do NOT invoke forge.
pnpm --filter @sapience/protocol run manifest:apply -- --dry-run

# Force a unit; same semantics as plan, then execute.
pnpm --filter @sapience/protocol run manifest:apply -- --force ethereal-testnet:PredictionMarketTokenFactory

# Machine-readable per-item results.
pnpm --filter @sapience/protocol run manifest:apply -- --json
```

For each successful deploy item the executor:

1. **Pre-flight (once)**: runs `forge build --ast --quiet`, validates each
   touched env's deployer (derives the address from the private key with
   `cast wallet address` and compares it to `deployerAddressEnv`), and auto-
   generates `FACTORY_SALT` per bundle if it's not already set
   (`keccak256("sapience-prediction-market-token-factory-<bundle>-<YYYY-MM-DD>")`).
2. Runs `forge script <item.script> --rpc-url <X> --private-key <Y> --broadcast`
   with env merged from `<bundle>/.env` and `<bundle>/config.json`. Appends
   `--verify --verifier <kind> …` based on `chain.verifier` (skippable with
   `--no-verify`).
3. Parses every `produces` env-var key out of forge's stdout
   (`^\s*<KEY>=\s*0x[a-f0-9]{40}$`).
4. Updates the unit's `state`:
   - `address`, `bytecodeHash`, `gitSha`, `deployedAt`, `txHash`
   - `blockCreated` (snapshot from `cast block-number` taken right before the deploy)
   - If `state.address` already existed and the new one differs, the previous
     `{address, blockCreated, deployedAt, gitSha, txHash}` is pushed to
     `state.legacy[0]` with `replacedAt` set to the new deploy's timestamp.
5. Writes each produced address back into `<bundle>/config.json`.
6. **Persists immediately** — manifest + config are saved before the next item
   runs, so a mid-plan crash leaves on-disk state consistent with the chain.
7. After **all** items in the plan succeed, regenerates
   `packages/sdk/contracts/addresses.ts` from the manifests (skippable with
   `--no-sync-sdk`). Each unit's `sdkExport` decides which `ChainAddressMap`
   export it lands in; the `state.legacy[]` array is mirrored verbatim into
   the SDK's `legacy[]`.

Configure items run forge but do not change `state` (post-deploy wiring is
idempotent — re-running it is safe and the manifest treats it as a no-op).

### `chain.verifier`

Each manifest declares verification concerns on the chain:

```jsonc
// ethereal-testnet.json
"chain": {
  ...
  "verifier": {
    "kind": "blockscout",
    "explorerUrlEnv": "PM_NETWORK_EXPLORER_URL"
  }
}
// arbitrum.json
"chain": {
  ...
  "verifier": { "kind": "etherscan", "apiKeyEnv": "SM_NETWORK_ETHERSCAN_API_KEY" }
}
```

### SDK address sync

The SDK's `packages/sdk/contracts/addresses.ts` is generated from the
manifests via `manifest:sync-sdk`. Apply auto-runs the sync after a
successful deploy. Manual regeneration is also available:

```bash
pnpm --filter @sapience/protocol run manifest:sync-sdk             # write
pnpm --filter @sapience/protocol run manifest:sync-sdk -- --dry-run  # preview
```

Each unit with `sdkExport: "<name>"` becomes a `ChainAddressMap` entry on
that export, keyed by `manifest.chain.chainId`. Two units sharing an
`sdkExport` (one per chain) combine into a multi-chain entry — that's how
`predictionMarketTokenFactory` ends up with all four supported chainIds in
the SDK.

Exports that aren't claimed by any manifest unit (today: just `eas`, the
external Ethereum Attestation Service contract) are left untouched.

#### Safety + limitations

- The executor halts on the first failure by default. Use
  `--continue-on-error` to bulk-attempt all items (e.g. CI smoke).
- Post-deploy hook failures are reported but **do not** roll back the deploy
  (the contract is on chain; the manifest reflects that). Re-run the hook
  manually if it failed.
- Cross-chain deploys are sequential (one chain at a time). CREATE3 twin
  deploys share the same auto-generated salt per bundle by construction.

### Operational helpers (`manifest:ops`)

The post-deploy / day-2 commands that used to live in `deploy.sh` (mint,
bridge, resolve, retry, check-\*) are now a single `ops.ts` CLI with
subcommands:

```bash
pnpm manifest:ops -- --help                          # full list
pnpm manifest:ops status            -- --bundle testnet
pnpm manifest:ops mint              -- --bundle testnet
pnpm manifest:ops bridge-to         -- --bundle testnet
OUTCOME=no pnpm manifest:ops resolve            -- --bundle testnet
pnpm manifest:ops check-bridge      -- --bundle mainnet   # cast call
```

Each subcommand reads `deployment/<bundle>/{config.json,.env}` for
addresses + secrets, and side-effecting commands (mint, bridge-\*) write
the new IDs/addresses back to `config.json` for chained use.

### Re-verify deployed contracts

```bash
# Verify every unit with a recorded address in the selected bundle
pnpm --filter @sapience/protocol run manifest:verify -- --bundle testnet

# Narrow to a single env inside the bundle
pnpm --filter @sapience/protocol run manifest:verify -- --bundle testnet --env arbitrum-sepolia

# Don't stop on first failed unit
pnpm --filter @sapience/protocol run manifest:verify -- --bundle testnet --continue-on-error
```

`verify` iterates each unit's recorded `state.address`, looks up its
`contractPath` (Solidity source `<path>:<Contract>` argument), reads
`chain.verifier` to build the right flags (Blockscout vs Etherscan-style),
and spawns `forge verify-contract`. forge exits 0 on success **and** on
"already verified" — re-runs are idempotent.

Units without a recorded address, without `contractPath`, or whose chain
lacks a verifier config (or the verifier's API key/URL env var) are
silently skipped with a reason in the output.

### Tests

```bash
pnpm --filter @sapience/protocol run manifest:test
```

139 unit tests covering schema validation (symmetry + bundle isolation of
`twinOf` and `wiringPeers`, dangling-ref detection, `postDeployHooks` +
`contractPath` shape), hash computation, populate idempotency, the
planner's dirty-propagation + topo-ordering + bundle filter, the
executor's forge integration + persistence path + Phase-3b helpers (salt,
deployer validation, verify-arg composition, SDK-sync hook), verify's
per-chain flag building + bundle filter + skip/halt/continue paths, and
`ops.ts`'s subcommand dispatch + key-extraction + `cast` tuple parsing.

### CI plan preview

`.github/workflows/protocol-deploy-plan.yml` runs on every PR targeting
`staging` that touches `packages/protocol/**`. It:

1. Runs `manifest:test` (catches schema regressions early).
2. Runs `forge build --ast --quiet`.
3. Runs `manifest:plan` and `manifest:plan -- --json`.
4. Posts (or updates, sticky) a PR comment with the human-readable plan
   wrapped in a `<details>` block.

The bot comment is marked with `<!-- manifest-plan-bot -->` so subsequent
runs replace the previous comment instead of stacking.

The manifests ship with `state.bytecodeHash` + `state.address` populated
for every deployed unit. Addresses come from `<bundle>/config.json` first
and fall back to `packages/sdk/contracts/addresses.ts` (via each unit's
`sdkExport`) for the resolvers / CT contracts that `deploy.sh` never wrote
to `config.json`. As a result, the CI bot's plan is **only** the diff
introduced by the PR — `manifest:plan` against the current `staging` head
reports `No changes`.

## Cross-chain dependency examples

Two cross-env dependency patterns drive the manifest design:

**1. Factory twin (CREATE3).** `PredictionMarketTokenFactory` is deployed on
both Ethereal and Arbitrum using the same salt and the same deployer EOA, so
the two factories share an address. They're declared as twins:

```jsonc
// ethereal-testnet.json
{
  "name": "PredictionMarketTokenFactory",
  "twinOf": "arbitrum:PredictionMarketTokenFactory",
}
```

If the factory contract source changes, both sides redeploy — the planner
sees the bytecode hash change on one and pulls in the twin automatically.

**2. Bridge peer.** `PredictionMarketBridge` (Ethereal) and
`PredictionMarketBridgeRemote` (Arbitrum) are LayerZero peers. Each declares
the other as a `wiringPeer`. If either redeploys, **both** sides re-run their
`Configure*` and `SetDVN_*` scripts to repoint the peer.

```jsonc
// ethereal-testnet.json
{
  "name": "PredictionMarketBridge",
  "wiringPeers": ["arbitrum:PredictionMarketBridgeRemote"],
  "configureScripts": [
    "src/scripts/ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge",
    "src/scripts/SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge",
  ],
}
```

Mainnet adds a second peer pair: `polygon:ConditionalTokensReader` ↔
`ethereal-mainnet:ConditionalTokensConditionResolver`.
