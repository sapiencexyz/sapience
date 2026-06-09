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

# 2. Preview.
pnpm manifest:plan -- --bundle testnet

# 3. Dry simulation against the live RPC (no gas, no broadcast).
pnpm manifest:apply -- --bundle testnet --simulate

# 4. Real deploy (writes addresses back to config.json + the manifest, and
#    regenerates the SDK addresses.ts).
pnpm manifest:apply -- --bundle testnet
```

Collateral on Robinhood testnet is the existing USDC
`0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F` (referenced in `config.json`, not
deployed). Pyth is not wired yet — `ManualConditionResolver` is the default
resolver. Add a `PythConditionResolver` unit + `PYTH_LAZER_ADDRESS` once Pyth is
available on Robinhood.

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
