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

| Manifest (`manifest/env/*.json`) | Bundle    | Chain                   | Bridge      |
| -------------------------------- | --------- | ----------------------- | ----------- |
| `robinhood-testnet.json`         | `testnet` | Robinhood Testnet 46630 | disabled    |
| `robinhood-mainnet.json`         | `mainnet` | Robinhood mainnet (TBD) | **enabled** |
| `arbitrum.json`                  | `mainnet` | Arbitrum One 42161      | **enabled** |
| `polygon.json`                   | `mainnet` | Polygon 137             | **enabled** |

The `mainnet` bundle is wired for the full bridge topology — **Robinhood (PM) ↔
Arbitrum One (SM)** for the token bridge (the factory shares an address as a
CREATE2 twin) and **Polygon → Robinhood** for the Gnosis ConditionalTokens
resolver. `bridgeEnabled` is `true` on all three, so `manifest:apply --bundle
mainnet` deploys the whole set across the three chains.

### Completing the config before the first mainnet apply

Every value still missing is a literal `REPLACE_ME_*` placeholder. List them:

```bash
cd packages/protocol
grep -rn REPLACE_ME deployment/mainnet/
```

Checklist (what each `REPLACE_ME` is):

- **Robinhood chain** — `chainId` in `manifest/env/robinhood-mainnet.json` is
  still `0`; set the real number. In `mainnet/config.json`:
  `REPLACE_ME_ROBINHOOD_CHAIN_ID`, `_RPC_URL`, `_EXPLORER_URL`,
  `_COLLATERAL_USDC`.
- **Robinhood LayerZero** (from LayerZero) — `REPLACE_ME_ROBINHOOD_LZ_ENDPOINT`,
  `_LZ_EID`, `_LZ_SEND_LIB`, `_LZ_RECEIVE_LIB`, `_LZ_EXECUTOR`.
- **DVNs for the Robinhood channel** (from LayerZero) — `REPLACE_ME_ROBINHOOD_DVN_1/2`,
  `REPLACE_ME_ARBITRUM_DVN_1/2_FOR_ROBINHOOD_CHANNEL`,
  `REPLACE_ME_POLYGON_DVN_1/2_FOR_ROBINHOOD_CHANNEL`. (The SM/Polygon LZ
  endpoint/EID/lib/executor are pre-filled real per-chain values — verify, but
  they don't change per channel; only the DVNs do.)
- **Deployers** — `REPLACE_ME_DEPLOYER_EOA` (the address; it appears 3× and must
  be ONE EOA shared by Robinhood + Arbitrum for the CREATE2 twin),
  `REPLACE_ME_POLYGON_DEPLOYER_EOA`. Private keys in `mainnet/.env`:
  `REPLACE_ME_DEPLOYER_PRIVATE_KEY` (PM+SM, same key),
  `REPLACE_ME_POLYGON_DEPLOYER_PRIVATE_KEY`, plus the Etherscan keys.
- **Governance** — `REPLACE_ME_VAULT_MANAGER`, `REPLACE_ME_BUDGET_MANAGER`.

Also out of band: the Arachnid CREATE2 proxy
(`0x4e59b44847b379578588920cA78FbF26c0B4956C`) must exist on Robinhood, and all
three deployer EOAs must hold native gas.

Then: `pnpm manifest:plan -- --bundle mainnet` → `--simulate` → real apply.
(Recommended: dry-run the same topology on the `testnet` bundle first.)

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
then run the apply. It's NOT a manifest unit on purpose: keeping collateral
external means the Escrow doesn't redeploy when the mock changes, and swapping to
the real token later is a one-line config change.

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
