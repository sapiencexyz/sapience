# Sapience Protocol — Unified Deployment Scripts

Unified deployment scripts for the Sapience prediction market protocol. A single set of Solidity scripts and one `deploy.sh` entrypoint handles both testnet and mainnet deployments. Environment-specific configuration lives in `.env` files under `../testnet/` and `../mainnet/`.

## Quick Start

```bash
# Full deploy (without verification)
SKIP_VERIFY=1 ./deploy.sh --env testnet all

# Verify all contracts after deploy
./deploy.sh --env testnet verify-pm
./deploy.sh --env testnet verify-sm
```

## Usage

```bash
./deploy.sh --env <testnet|mainnet> <command>
```

The `--env` flag determines which `.env` file to load (`../testnet/.env` or `../mainnet/.env`) and where to write `deployments.json`.

## Deployment Order

A full deployment (`all`) runs these steps automatically, in order:

### Phase 1 — PM Network (Ethereal)

| Step | Script                        | Produces                          | Depends on                                                                                     |
| ---- | ----------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | `DeployResolver`              | `RESOLVER_ADDRESS`                | —                                                                                              |
| 2    | `DeployFactory`               | `FACTORY_ADDRESS`                 | `FACTORY_SALT`                                                                                 |
| 3    | `DeployPredictionMarket`      | `PREDICTION_MARKET_ADDRESS`       | `FACTORY_ADDRESS`, `COLLATERAL_TOKEN_ADDRESS`                                                  |
| 4    | `ConfigureFactory`            | —                                 | `FACTORY_ADDRESS`, `PREDICTION_MARKET_ADDRESS`                                                 |
| 5    | `DeployEtherealBridge`        | `PM_NETWORK_BRIDGE_ADDRESS`       | `FACTORY_ADDRESS`, `PM_NETWORK_LZ_ENDPOINT`                                                    |
| 6    | `DeploySecondaryMarketEscrow` | `SECONDARY_MARKET_ESCROW_ADDRESS` | —                                                                                              |
| 7    | `DeployOnboardingSponsor`     | `ONBOARDING_SPONSOR_ADDRESS`      | `PREDICTION_MARKET_ADDRESS`, `COLLATERAL_TOKEN_ADDRESS`, `MAX_ENTRY_PRICE_BPS`, vault deployed |

> **Step 7 prerequisite:** The PredictionMarketVault should be deployed first (`deploy-vault`). The vault's manager address (`VAULT_MANAGER`) is used as the default `REQUIRED_COUNTERPARTY` if not explicitly set. Step 7 is skipped if `MAX_ENTRY_PRICE_BPS` is not set — run `deploy-sponsor` later if needed.

### Phase 2 — SM Network (Arbitrum)

| Step | Script               | Produces                             | Depends on                                  |
| ---- | -------------------- | ------------------------------------ | ------------------------------------------- |
| 9    | `DeployFactorySM`    | `FACTORY_ADDRESS` (same via CREATE2) | `FACTORY_SALT`                              |
| 10   | `DeployRemoteBridge` | `SM_NETWORK_BRIDGE_ADDRESS`          | `FACTORY_ADDRESS`, `SM_NETWORK_LZ_ENDPOINT` |

### Phase 3 — Cross-chain Configuration

| Step | Script                    | Network | Depends on                                                                  |
| ---- | ------------------------- | ------- | --------------------------------------------------------------------------- |
| 11   | `ConfigureEtherealBridge` | PM      | `PM_NETWORK_BRIDGE_ADDRESS`, `SM_NETWORK_BRIDGE_ADDRESS`                    |
| 12   | `ConfigureRemoteBridge`   | SM      | `SM_NETWORK_BRIDGE_ADDRESS`, `PM_NETWORK_BRIDGE_ADDRESS`, `FACTORY_ADDRESS` |
| 13   | `SetDVN_EtherealBridge`   | PM      | bridge + DVN/library addresses                                              |
| 14   | `SetDVN_RemoteBridge`     | SM      | bridge + DVN/library/executor addresses                                     |

### Additional Deployments (run separately)

These are not part of `all` and must be run as standalone commands:

```bash
# Pyth oracle resolver
SKIP_VERIFY=1 ./deploy.sh --env testnet deploy-pyth-resolver

# ConditionalTokens resolver pair (Polygon + Ethereal + LZ bridge config)
SKIP_VERIFY=1 ./deploy.sh --env testnet deploy-ct-resolvers
SKIP_VERIFY=1 ./deploy.sh --env testnet configure-ct-dvn

# Passive liquidity vault
SKIP_VERIFY=1 ./deploy.sh --env testnet deploy-vault
```

### Verification (after all deploys)

```bash
./deploy.sh --env testnet verify-pm       # Ethereal contracts
./deploy.sh --env testnet verify-sm       # Arbitrum contracts
./deploy.sh --env testnet verify-polygon  # Polygon contracts (CT Reader)
```

## Upgrade Flow

When redeploying core contracts (e.g. after contract changes), use `upgrade-escrow`. This redeploys Factory, Escrow, Bridges, SecondaryMarketEscrow, and OnboardingSponsor — then reconfigures cross-chain bridges and DVN:

```bash
SKIP_VERIFY=1 ./deploy.sh --env testnet upgrade-escrow
```

## All Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `all`                     | Full deployment (Phase 1 + 2 + 3 + verification)     |
| `all-with-collateral`     | Deploy test collateral token first, then full deploy |
| `upgrade-escrow`          | Redeploy core contracts + bridges + reconfigure      |
| `phase1`                  | PM Network only (Ethereal)                           |
| `phase2`                  | SM Network only (Arbitrum)                           |
| `phase3`                  | Configure bridges (both chains)                      |
| `phase3b`                 | Configure DVN/libraries (both chains)                |
| `deploy-secondary-market` | Deploy SecondaryMarketEscrow standalone              |
| `deploy-sponsor`          | Deploy OnboardingSponsor standalone                  |
| `deploy-vault`            | Deploy PredictionMarketVault standalone              |
| `deploy-pyth-resolver`    | Deploy PythConditionResolver                         |
| `deploy-ct-resolvers`     | Deploy CT Reader + Resolver + configure LZ bridge    |
| `configure-ct-dvn`        | Configure DVN for CT Reader/Resolver                 |
| `verify-pm`               | Verify all PM Network contracts                      |
| `verify-sm`               | Verify all SM Network contracts                      |
| `verify-polygon`          | Verify Polygon contracts                             |
| `status`                  | Check deployment status on PM Network                |
| `status-sm`               | Check deployment status on SM Network                |
| `mint`                    | Mint position tokens (test)                          |
| `bridge-to`               | Bridge tokens to SM Network                          |
| `bridge-back`             | Bridge tokens back to PM Network                     |
| `resolve`                 | Resolve a prediction (`OUTCOME=yes\|no`)             |
| `retry-pm`                | Retry failed bridge from PM Network                  |
| `retry-sm`                | Retry failed bridge from SM Network                  |
| `test-ct-bridge`          | Test CT resolution via LayerZero                     |
| `check-ct-resolution`     | Check CT resolution status                           |
| `burn`                    | Burn bilateral positions                             |
| `test-secondary-trade`    | Test secondary market atomic swap                    |

## Environment Variables

### Required — Deployers

```bash
PM_NETWORK_DEPLOYER_ADDRESS=0x...
PM_NETWORK_DEPLOYER_PRIVATE_KEY=0x...
SM_NETWORK_DEPLOYER_ADDRESS=0x...       # should match PM for CREATE2
SM_NETWORK_DEPLOYER_PRIVATE_KEY=0x...
```

### Required — RPCs

```bash
PM_NETWORK_RPC_URL=                     # Ethereal RPC
SM_NETWORK_RPC_URL=                     # Arbitrum RPC
```

| Network | PM RPC                         | SM RPC                                   |
| ------- | ------------------------------ | ---------------------------------------- |
| testnet | `https://rpc.etherealtest.net` | `https://sepolia-rollup.arbitrum.io/rpc` |
| mainnet | `https://rpc.ethereal.trade`   | `https://arb1.arbitrum.io/rpc`           |

### Required — Collateral

```bash
COLLATERAL_TOKEN_ADDRESS=0x...          # wUSDe or test collateral
```

### Required — LayerZero

```bash
PM_NETWORK_LZ_ENDPOINT=0x...           # LZ EndpointV2 on Ethereal
PM_NETWORK_LZ_EID=                     # LZ Endpoint ID for Ethereal
SM_NETWORK_LZ_ENDPOINT=0x...           # LZ EndpointV2 on Arbitrum
SM_NETWORK_LZ_EID=                     # LZ Endpoint ID for Arbitrum
```

### Required — DVN & Libraries (Phase 3b)

```bash
# PM Network (Ethereal)
PM_NETWORK_SEND_LIB=0x...
PM_NETWORK_RECEIVE_LIB=0x...
PM_NETWORK_DVN_1=0x...                 # required

# SM Network (Arbitrum)
SM_NETWORK_SEND_LIB=0x...
SM_NETWORK_RECEIVE_LIB=0x...
SM_NETWORK_DVN_1=0x...                 # required
SM_NETWORK_EXECUTOR=0x...              # required
```

### Optional — DVN

```bash
PM_NETWORK_DVN_2=0x...                 # 2nd DVN (mainnet recommended, testnet optional)
SM_NETWORK_DVN_2=0x...                 # 2nd DVN
PM_NETWORK_EXECUTOR=0x...              # executor for PM send config
ULN_CONFIRMATIONS=1                    # 1 for testnet, 15 for mainnet
```

### Optional — OnboardingSponsor

> **Prerequisite:** Deploy the vault first (`deploy-vault`). `VAULT_MANAGER` is used as the default counterparty.

```bash
MAX_ENTRY_PRICE_BPS=5000               # max entry price in basis points (5000 = 50%)
REQUIRED_COUNTERPARTY=0x...            # defaults to VAULT_MANAGER if not set
MATCH_LIMIT=1000000000000000000        # per-user budget in wei (default: 1 ether)
```

### Optional — PythConditionResolver

```bash
PYTH_LAZER_ADDRESS=0x...               # Pyth Lazer contract address
```

### Optional — ConditionalTokens Resolvers (Polygon)

```bash
POLYGON_DEPLOYER_ADDRESS=0x...
POLYGON_DEPLOYER_PRIVATE_KEY=0x...
POLYGON_RPC_URL=https://...
POLYGON_LZ_ENDPOINT=0x...
POLYGON_LZ_EID=
POLYGON_CONDITIONAL_TOKENS_ADDRESS=0x...
POLYGON_SEND_LIB=0x...
POLYGON_DVN_1=0x...
POLYGON_DVN_2=0x...
POLYGON_EXECUTOR=0x...
```

### Optional — Vault

```bash
VAULT_MANAGER=0x...                    # defaults to deployer
VAULT_NAME="Sapience Vault V2"         # default
VAULT_SYMBOL="SVLT"                    # default
```

### Optional — Verification

```bash
PM_NETWORK_EXPLORER_URL=               # Blockscout API URL for Ethereal
PM_NETWORK_CHAIN_ID=                   # chain ID for verification
SM_NETWORK_ETHERSCAN_API_KEY=          # Arbiscan API key
POLYGON_ETHERSCAN_API_KEY=             # Polygonscan API key
```

| Network | Explorer URL                             | Chain ID   |
| ------- | ---------------------------------------- | ---------- |
| testnet | `https://explorer.etherealtest.net/api/` | `13374202` |
| mainnet | `https://explorer.ethereal.trade/api/`   | `5064014`  |

### Optional — Factory Salt

```bash
FACTORY_SALT=0x...                     # custom CREATE2 salt for factory
```

> If `FACTORY_SALT` is not set, `deploy.sh` auto-generates one from the current date and network:
> `keccak256("sapience-prediction-market-token-factory-<network>-<YYYY-MM-DD>")`.
> This ensures a fresh salt on each day's deployment, avoiding CREATE2 address collisions.
> You only need to set it manually if you're deploying twice on the same day or need a specific salt.

## Configuration

Configuration is split into two files per environment:

- **`config.json`** — Public, non-sensitive values (RPC URLs, contract addresses, DVN config, etc.). Versioned in git.
- **`.env`** — Secrets only (private keys, API keys). Gitignored.

On deploy, `config.json` is loaded first, then `.env` overrides (secrets take precedence). Deployed contract addresses are written to `config.json` automatically.

## Directory Structure

```
scripts/
├── deploy/              # Unified scripts (this directory)
│   ├── deploy.sh        # Main entrypoint
│   ├── *.s.sol          # Forge deployment scripts
│   ├── vault/           # Vault-specific scripts
│   └── README.md        # This file
├── testnet/
│   ├── config.json      # Public config (versioned)
│   ├── .env             # Secrets only (gitignored)
│   ├── .env.example     # Template for secrets
│   └── deployments.json # Deployed addresses (auto-generated)
├── mainnet/
│   ├── config.json      # Public config (versioned)
│   ├── .env             # Secrets only (gitignored)
│   ├── .env.example     # Template for secrets
│   └── deployments.json # Deployed addresses (auto-generated)
└── debug/               # Debug/diagnostic scripts
```
