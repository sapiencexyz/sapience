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

| Manifest (`manifest/env/*.json`) | Bundle    | Chain                   | Bridge            |
| -------------------------------- | --------- | ----------------------- | ----------------- |
| `robinhood-testnet.json`         | `testnet` | Robinhood Testnet 46630 | disabled          |
| `robinhood-mainnet.json`         | `mainnet` | Robinhood mainnet (TBD) | disabled (staged) |
| `arbitrum.json`                  | `mainnet` | Arbitrum One 42161      | disabled (staged) |
| `polygon.json`                   | `mainnet` | Polygon 137             | disabled (staged) |

The `mainnet` bundle now carries the full bridge topology, but every cross-chain
unit is inert (`bridgeEnabled: false`) so the standalone 6-unit protocol still
deploys on Robinhood alone. With the bridge off, `manifest:apply --bundle mainnet`
only touches the Robinhood standalone units; `arbitrum.json`/`polygon.json` deploy
nothing.

### Standalone (no bridge)

Robinhood ships with `"bridgeEnabled": false` in its manifest. Every unit that
is coupled to another chain (a CREATE3 twin or a LayerZero wiring peer — see
`isBridgeUnit`) is then treated as inert: the planner skips it and cross-env
symmetry validation is not enforced.

### Enabling the Robinhood mainnet bridge (go-live)

Topology when on: **Robinhood (PM) ↔ Arbitrum One (SM)** for the token bridge
(factory shares an address as a CREATE2 twin), and **Polygon → Robinhood** for the
Gnosis ConditionalTokens resolver. The units and `config.json` keys are already
staged; to turn it on:

1. **Confirm LayerZero supports Robinhood** and fill the `PM_NETWORK_LZ_*`
   placeholders in `mainnet/config.json` (endpoint, EID, send/receive lib, DVNs,
   executor). Re-confirm the `SM_NETWORK_DVN_*` / `POLYGON_DVN_*` choices actually
   support the Robinhood channel. Set the real `PM_NETWORK_CHAIN_ID` /
   `chainId` (manifest env file) and `COLLATERAL_TOKEN_ADDRESS`.
2. **Use one deployer EOA on Robinhood + Arbitrum** (`PM_NETWORK_DEPLOYER_ADDRESS`
   == `SM_NETWORK_DEPLOYER_ADDRESS`, matching private keys) so the CREATE2 factory
   twin lands on the same address. Ensure the Arachnid CREATE2 proxy
   (`0x4e59b44847b379578588920cA78FbF26c0B4956C`) exists on Robinhood. Fund all
   three deployer EOAs with gas.
3. **Add the factory twin** on the PM side: in `robinhood-mainnet.json` add
   `"twinOf": "arbitrum:PredictionMarketTokenFactory"` to
   `PredictionMarketTokenFactory`.
4. **Flip `bridgeEnabled: true`** in `robinhood-mainnet.json`, `arbitrum.json`,
   and `polygon.json`.
5. `pnpm manifest:plan -- --bundle mainnet` → `--simulate` → real apply.

(Validate the bridge end-to-end on the `testnet` bundle first — same steps with
Arbitrum Sepolia / Polygon Amoy — once LayerZero is available on Robinhood
testnet 46630.)

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
