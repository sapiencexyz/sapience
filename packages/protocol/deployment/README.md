# Sapience Protocol — Manifest deploy pipeline

This TypeScript-driven pipeline is how the protocol is deployed to **Robinhood
Chain**. It was ported from the qeng repo (where it deploys the
Ethereal/Arbitrum/Polygon set) and adapted to this repo's contract set and
script layout (`src/scripts/deploy/`).

> The legacy bash pipeline `src/scripts/deploy/deploy.sh` still exists and is
> the path used for the Ethereal mainnet/testnet + Arbitrum bridge deployments.
> The manifest pipeline here is **additive** — it owns the Robinhood
> environments and does not touch the Ethereal deployments.

## Active environments

| Manifest (`manifest/env/*.json`) | Bundle    | Chain                   | Bridge   |
| -------------------------------- | --------- | ----------------------- | -------- |
| `robinhood-testnet.json`         | `testnet` | Robinhood Testnet 46630 | disabled |
| `robinhood-mainnet.json` (TODO)  | `mainnet` | Robinhood mainnet (TBD) | disabled |

Each bundle contains only the Robinhood env whose file exists, so
`manifest:apply --bundle testnet` only ever touches Robinhood testnet.

### Standalone (no bridge)

Robinhood ships with `"bridgeEnabled": false` in its manifest. Every unit that
is coupled to another chain (a CREATE3 twin or a LayerZero wiring peer — see
`isBridgeUnit`) is then treated as inert: the planner skips it and cross-env
symmetry validation is not enforced. To switch the bridge on later, add the
bridge units + an SM-remote manifest and flip the flag to `true` (or remove it).

## Entrypoints

| Command                                    | What it does                                                      |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm manifest:plan -- --bundle testnet`   | Preview the redeploy plan.                                        |
| `pnpm manifest:apply -- --bundle testnet`  | Build + validate + apply the plan, with inline `--verify`.        |
| `pnpm manifest:verify -- --bundle testnet` | Re-verify already-deployed contracts on the explorer.             |
| `pnpm manifest:populate`                   | Refresh `state.bytecodeHash` / `state.address` from `out/` + SDK. |
| `pnpm manifest:sync-sdk`                   | Regenerate `packages/sdk/contracts/addresses.ts` from manifests.  |
| `pnpm manifest:test`                       | Run the manifest unit tests.                                      |

`manifest:apply` supports `--dry-run` (plan only, no forge) and `--simulate`
(runs forge against the live RPC **without** `--broadcast` — validates the
deploy scripts without spending gas).

## Robinhood testnet deploy flow

```bash
cd packages/protocol

# 1. Fill in the secrets + placeholders.
cp deployment/testnet/.env.example deployment/testnet/.env
#   → set PM_NETWORK_DEPLOYER_PRIVATE_KEY in deployment/testnet/.env
#   → replace the 0x0000…0000 placeholders in deployment/testnet/config.json
#     (PM_NETWORK_DEPLOYER_ADDRESS, DEPLOYER_ADDRESS, VAULT_MANAGER, BUDGET_MANAGER)

# 2. Collateral: deploy the test mock once, paste the address (see below).

# 3. Preview.
pnpm manifest:plan -- --bundle testnet

# 4. Dry simulation against the live RPC (no gas, no broadcast).
pnpm manifest:apply -- --bundle testnet --simulate

# 5. Real deploy (writes addresses back to config.json + the manifest, and
#    regenerates the SDK addresses.ts).
pnpm manifest:apply -- --bundle testnet
```

### Test collateral (testnet)

The collateral is treated as an **external token** — `COLLATERAL_TOKEN_ADDRESS`
in `config.json`, exactly as the real Robinhood token will be. Until that token
exists, deploy a throwaway mock ERC-20 (18 decimals) **once**, manually, and
paste its address:

```bash
cd packages/protocol
set -a; . deployment/testnet/.env; set +a   # loads PM_NETWORK_DEPLOYER_PRIVATE_KEY
export PM_NETWORK_DEPLOYER_ADDRESS=0x<deployer>   # must match the private key
# Optional overrides (defaults: "Test USDe" / "tUSDe" / 1,000,000e18):
# export COLLATERAL_NAME="Test USDe" COLLATERAL_SYMBOL="tUSDe" COLLATERAL_INITIAL_SUPPLY=1000000000000000000000000

forge script src/scripts/deploy/DeployCollateral.s.sol:DeployCollateral \
  --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
```

Copy the logged `COLLATERAL_TOKEN_ADDRESS=` into `deployment/testnet/config.json`,
then run the apply. It's NOT a manifest unit on purpose (the Escrow's bytecode
hash doesn't change when the token address changes, so the planner won't
auto-redeploy on its own). But the collateral IS immutable in the Escrow/Vault
constructors, so changing it does require a redeploy — see below.

### Redeploying the escrow (e.g. swapping collateral) — the factory must move too

**Rule: whenever a redeploy changes the `PredictionMarketEscrow`, the
`PredictionMarketTokenFactory` MUST be redeployed to a NEW address. Never reuse
the existing factory with a new escrow.** The factory and escrow are a bound pair
(the factory authorizes exactly one escrow as its deployer, and CREATE3 token
addresses derive under that pairing); reusing the old factory leaves stale
authorization and risks address reuse across the old and new escrow.

What this means mechanically:

- The collateral (`COLLATERAL_TOKEN_ADDRESS`) is **immutable** in both the
  `PredictionMarketEscrow` and `PredictionMarketVault` constructors, so swapping
  it forces both to redeploy. A constructor-arg change does NOT mark them dirty
  on its own (bytecode is unchanged) — you must `--force` them.
- The factory unit already declares `stateInvalidatedBy: ["PredictionMarketEscrow"]`,
  so it joins the plan automatically. **But** `DeployFactory.s.sol` skips if code
  already exists at the predicted CREATE2 address, and `manifest:apply`
  auto-generates a **date-based** `FACTORY_SALT`
  (`keccak("sapience-prediction-market-token-factory-<bundle>-YYYY-MM-DD")`) when
  unset. So you must ensure a **fresh** salt — otherwise the factory no-ops to its
  old address, violating the rule.
- **Do NOT pin a prior deploy's `FACTORY_SALT`.** Let apply auto-generate today's
  (a different day ⇒ a different salt ⇒ a new factory), or pin a deliberate new
  one. `OnboardingSponsor` redeploys too (constructorDeps).

```bash
cd packages/protocol
# 1. set the new COLLATERAL_TOKEN_ADDRESS in deployment/testnet/config.json
# 2. do NOT export an old FACTORY_SALT — a fresh salt is required
pnpm manifest:plan    -- --bundle testnet                 # expect: Escrow, Vault, Factory, OnboardingSponsor
pnpm manifest:apply   -- --bundle testnet --simulate \
  --force robinhood-testnet:PredictionMarketEscrow \
  --force robinhood-testnet:PredictionMarketVault         # confirm the Factory deploys at a NEW address
pnpm manifest:apply   -- --bundle testnet \
  --force robinhood-testnet:PredictionMarketEscrow \
  --force robinhood-testnet:PredictionMarketVault
```

Old addresses rotate to `state.legacy[]` in the manifest; `config.json` and the
SDK `addresses.ts` regenerate. `ManualConditionResolver` and
`SecondaryMarketEscrow` are collateral-agnostic and keep their addresses.

Pyth is not wired yet — `ManualConditionResolver` is the default resolver. Add a
`PythConditionResolver` unit + `PYTH_LAZER_ADDRESS` once Pyth is available on
Robinhood.

## Configuration

Per-environment under `testnet/` (and `mainnet/` once it exists):

- **`config.json`** — public values (RPC, explorer, deployer address, collateral,
  vault params). Versioned in git. `apply` appends deployed addresses here.
- **`.env`** — secrets only (deployer private key). Gitignored.

Loading order: `.env` first, then `config.json` overrides, then `process.env`
overrides everything.

See `manifest/README.md` for the manifest model in depth (deploy units, bundle
isolation, twinOf semantics, post-deploy hooks).
</content>
</invoke>
