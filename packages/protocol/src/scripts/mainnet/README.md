# Bridge Mainnet Deployment Scripts

Scripts for deploying and configuring the position token bridge between PM Network (Ethereal) and SM Network (Arbitrum) mainnets.

## Overview

This deployment deploys the full bridge infrastructure for mainnet, connecting Ethereal mainnet (where PredictionMarketEscrow lives) to Arbitrum mainnet (secondary market).

### Contracts Deployed

**On PM Network (Source Chain - Ethereal Mainnet):**

- ManualConditionResolver
- PredictionMarketEscrow
- PredictionMarketBridge

**On SM Network (Remote Chain - Arbitrum Mainnet):**

- PredictionMarketTokenFactory
- PredictionMarketBridgeRemote

## Prerequisites

1. Install Foundry
2. Set up environment variables in `.env`:

```bash
# PM Network Deployer (Ethereal Mainnet)
PM_NETWORK_DEPLOYER_PRIVATE_KEY=0x...
PM_NETWORK_DEPLOYER_ADDRESS=0x...

# SM Network Deployer (Arbitrum Mainnet)
SM_NETWORK_DEPLOYER_PRIVATE_KEY=0x...
SM_NETWORK_DEPLOYER_ADDRESS=0x...

# PM Network (Ethereal Mainnet)
PM_NETWORK_RPC_URL=https://rpc.ethereal.network
PM_NETWORK_LZ_ENDPOINT=0x...              # LayerZero V2 Endpoint
PM_NETWORK_LZ_EID=...                     # LayerZero Endpoint ID

# SM Network (Arbitrum Mainnet)
SM_NETWORK_RPC_URL=https://arb1.arbitrum.io/rpc
SM_NETWORK_LZ_ENDPOINT=0x1a44076050125825900e736c501f859c50fE728c
SM_NETWORK_LZ_EID=30110

# Collateral Token (canonical address in @sapience/sdk/contracts/addresses)
COLLATERAL_TOKEN_ADDRESS=0x...

# LayerZero Library and DVN Configuration (2 DVNs required for production)
# PM Network
PM_NETWORK_SEND_LIB=0x...
PM_NETWORK_RECEIVE_LIB=0x...
PM_NETWORK_DVN_1=0x...                    # First DVN (e.g., LayerZero DVN)
PM_NETWORK_DVN_2=0x...                    # Second DVN (e.g., Google Cloud DVN)
PM_NETWORK_EXECUTOR=0x...                 # Optional

# SM Network (Arbitrum)
SM_NETWORK_SEND_LIB=0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1
SM_NETWORK_RECEIVE_LIB=0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6
SM_NETWORK_DVN_1=0x2f55C492897526677C5B68fb199ea31E2c126416    # LayerZero DVN
SM_NETWORK_DVN_2=0x...                                         # Second DVN
SM_NETWORK_EXECUTOR=0x31CAe3B7fB82d847621859fb1585353c5720660D

# Contract Verification
# PM Network (Ethereal) uses Blockscout - no API key needed
# SM Network (Arbitrum) uses Arbiscan - API key optional but recommended
SM_NETWORK_ETHERSCAN_API_KEY=your_arbiscan_api_key
```

3. Fund deployer address on both chains with native tokens for gas.

**Finding LayerZero addresses:**

- Endpoints: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
- DVN addresses: https://docs.layerzero.network/v2/developers/evm/technical-reference/dvn-addresses

## Deployment Steps

### Optional: Deploy Test Collateral Token

**For testing only** - if you need a mock ERC20 token instead of using real collateral:

```bash
# Deploy test collateral token (TESTING ONLY)
forge script src/scripts/mainnet/00_DeployCollateral.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv

# Add to .env: COLLATERAL_TOKEN_ADDRESS=...
```

Optional environment variables for test collateral:

- `COLLATERAL_NAME` - Token name (default: "Test USDe")
- `COLLATERAL_SYMBOL` - Token symbol (default: "tUSDe")
- `COLLATERAL_INITIAL_SUPPLY` - Initial supply in wei (default: 1,000,000 tokens)

### Phase 1: Deploy Ethereal Infrastructure

Run on **PM Network** (Ethereal Mainnet):

```bash
# 1. Deploy manual condition resolver
forge script src/scripts/mainnet/01_DeployResolver.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv

# Add to .env: RESOLVER_ADDRESS=...

# 2. Deploy PredictionMarketEscrow
forge script src/scripts/mainnet/02_DeployPredictionMarket.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv

# Add to .env: PREDICTION_MARKET_ADDRESS=...

# 3. Deploy Ethereal Bridge
forge script src/scripts/mainnet/03_DeployEtherealBridge.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv

# Add to .env: PM_NETWORK_BRIDGE_ADDRESS=...
```

### Phase 2: Deploy Arbitrum Infrastructure

Run on **SM Network** (Arbitrum Mainnet):

```bash
# 4. Deploy Position Token Factory
forge script src/scripts/mainnet/04_DeployFactory.s.sol \
  --rpc-url $SM_NETWORK_RPC_URL \
  --broadcast \
  --verify --etherscan-api-key $SM_NETWORK_ETHERSCAN_API_KEY \
  -vvvv

# Add to .env: FACTORY_ADDRESS=...

# 5. Deploy Remote Bridge
forge script src/scripts/mainnet/05_DeployRemoteBridge.s.sol \
  --rpc-url $SM_NETWORK_RPC_URL \
  --broadcast \
  --verify --etherscan-api-key $SM_NETWORK_ETHERSCAN_API_KEY \
  -vvvv

# Add to .env: SM_NETWORK_BRIDGE_ADDRESS=...
```

### Phase 3: Configure Bridges

```bash
# 6. Configure Ethereal Bridge (run on PM Network)
forge script src/scripts/mainnet/06_ConfigureEtherealBridge.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# 6b. Set DVN/Libraries for Ethereal Bridge
forge script src/scripts/mainnet/06b_SetDVN_EtherealBridge.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# 7. Configure Remote Bridge (run on SM Network)
forge script src/scripts/mainnet/07_ConfigureRemoteBridge.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv

# 7b. Set DVN/Libraries for Remote Bridge
forge script src/scripts/mainnet/07b_SetDVN_RemoteBridge.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv
```

### Utilities

```bash
# 8a. Check PM Network status
forge script src/scripts/mainnet/08a_CheckStatus_PMNetwork.s.sol --rpc-url $PM_NETWORK_RPC_URL -vvvv

# 8b. Check SM Network status
forge script src/scripts/mainnet/08b_CheckStatus_SMNetwork.s.sol --rpc-url $SM_NETWORK_RPC_URL -vvvv
```

## Script Summary

| #   | Script                     | Chain    | Description                               |
| --- | -------------------------- | -------- | ----------------------------------------- |
| 00  | DeployCollateral           | Ethereal | Deploy test ERC20 collateral (optional)   |
| 01  | DeployResolver             | Ethereal | Deploy ManualConditionResolver            |
| 02  | DeployPredictionMarket     | Ethereal | Deploy PredictionMarketEscrow             |
| 03  | DeployEtherealBridge       | Ethereal | Deploy PredictionMarketBridge             |
| 04  | DeployFactory              | Arbitrum | Deploy PredictionMarketTokenFactory       |
| 05  | DeployRemoteBridge         | Arbitrum | Deploy PredictionMarketBridgeRemote       |
| 06  | ConfigureEtherealBridge    | Ethereal | Set peer and bridge config                |
| 06b | SetDVN_EtherealBridge      | Ethereal | Set SendLib, ReceiveLib, DVN config       |
| 07  | ConfigureRemoteBridge      | Arbitrum | Set peer, config, factory deployer        |
| 07b | SetDVN_RemoteBridge        | Arbitrum | Set SendLib, ReceiveLib, DVN, Executor    |
| 08a | CheckStatus_PMNetwork      | Ethereal | View PM Network deployment status         |
| 08b | CheckStatus_SMNetwork      | Arbitrum | View SM Network deployment status         |
| 09  | MintPredictionMarketTokens | Ethereal | Mint prediction market tokens for testing |
| 10  | TestBridgeToRemote         | Ethereal | Bridge tokens to Arbitrum                 |
| 10b | ResolvePrediction          | Ethereal | Resolve condition and settle prediction   |
| 11  | TestBridgeBack             | Arbitrum | Bridge tokens back to Ethereal            |
| 12  | RetryBridgePM              | Ethereal | Retry a pending bridge from PM Network    |
| 13  | RetryBridgeSM              | Arbitrum | Retry a pending bridge from SM Network    |

## Testing: Mint and Bridge

After deployment, you can test the system by minting position tokens and bridging them.

### Prerequisites for Testing

Add these environment variables for testing:

```bash
# Test accounts (two separate EOAs for predictor and counterparty)
PREDICTOR_PRIVATE_KEY=0x...
COUNTERPARTY_PRIVATE_KEY=0x...

# Optional: customize collateral amounts (in wei, default 100 tokens / 33 tokens)
PREDICTOR_COLLATERAL=100000000000000000000
COUNTERPARTY_COLLATERAL=33333333333333333333

# Optional: bridge amount (default 10 tokens)
BRIDGE_AMOUNT=10000000000000000000
```

### Step 1: Mint Position Tokens

Mint position tokens using two EOAs (predictor and counterparty):

```bash
forge script src/scripts/mainnet/09_MintPredictionMarketTokens.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv

# Save the output to .env:
# PREDICTION_ID=...
# PREDICTOR_TOKEN_ADDRESS=...
# COUNTERPARTY_TOKEN_ADDRESS=...
# PICK_CONFIG_ID=...
# CONDITION_ID=...
```

### Step 2: Bridge Tokens to Arbitrum

Bridge predictor tokens from Ethereal to Arbitrum:

```bash
forge script src/scripts/mainnet/10_TestBridgeToRemote.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv

# Track the message: https://layerzeroscan.com/
```

### Step 3: Resolve the Prediction

Resolve the condition and allow settlement:

```bash
# Resolve with YES wins (predictor wins)
OUTCOME=yes forge script src/scripts/mainnet/10b_ResolvePrediction.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv

# Or resolve with NO wins (counterparty wins)
OUTCOME=no forge script src/scripts/mainnet/10b_ResolvePrediction.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv

# Or resolve as TIE (refund both sides)
OUTCOME=tie forge script src/scripts/mainnet/10b_ResolvePrediction.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv
```

### Step 4: Bridge Tokens Back to Ethereal

After tokens arrive on Arbitrum, bridge them back:

```bash
forge script src/scripts/mainnet/11_TestBridgeBack.s.sol \
  --rpc-url $SM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv

# Track the message: https://layerzeroscan.com/
```

### Test Script Options

| Variable                  | Description                                           | Default      |
| ------------------------- | ----------------------------------------------------- | ------------ |
| `PREDICTOR_COLLATERAL`    | Predictor's collateral amount                         | 100 tokens   |
| `COUNTERPARTY_COLLATERAL` | Counterparty's collateral amount                      | 33.33 tokens |
| `BRIDGE_AMOUNT`           | Amount to bridge                                      | 10 tokens    |
| `BRIDGE_RECIPIENT`        | Override recipient address                            | sender       |
| `IS_PREDICTOR_TOKEN`      | Bridge predictor (true) or counterparty (false) token | true         |
| `OUTCOME`                 | Resolution outcome: "yes", "no", or "tie"             | yes          |

## Automated Deployment

Use the `deploy-all.sh` script to run all steps automatically:

```bash
# Full deployment with DVN config and verification
./src/scripts/mainnet/deploy-all.sh all

# Full deployment WITHOUT verification (faster, verify later)
SKIP_VERIFY=1 ./src/scripts/mainnet/deploy-all.sh all

# Full deployment with test collateral (for testing)
./src/scripts/mainnet/deploy-all.sh all-with-collateral

# Run individual deployment phases
./src/scripts/mainnet/deploy-all.sh collateral # Deploy test collateral (optional)
./src/scripts/mainnet/deploy-all.sh phase1     # Ethereal infrastructure
./src/scripts/mainnet/deploy-all.sh phase2     # Arbitrum infrastructure
./src/scripts/mainnet/deploy-all.sh phase3     # Basic bridge config
./src/scripts/mainnet/deploy-all.sh phase3b    # DVN/library config
./src/scripts/mainnet/deploy-all.sh status     # Check status

# Verify contracts separately (after deployment)
./src/scripts/mainnet/deploy-all.sh verify-pm  # Verify Ethereal contracts (Blockscout)
./src/scripts/mainnet/deploy-all.sh verify-sm  # Verify Arbitrum contracts (Arbiscan)

# Run test commands
./src/scripts/mainnet/deploy-all.sh mint         # Mint position tokens
./src/scripts/mainnet/deploy-all.sh bridge-to    # Bridge to Arbitrum
OUTCOME=yes ./src/scripts/mainnet/deploy-all.sh resolve  # Resolve prediction
./src/scripts/mainnet/deploy-all.sh bridge-back  # Bridge back to Ethereal

# Retry failed bridges (use when ACK failed or message didn't arrive)
BRIDGE_ID=0x... ./src/scripts/mainnet/deploy-all.sh retry-pm  # Retry from Ethereal
BRIDGE_ID=0x... ./src/scripts/mainnet/deploy-all.sh retry-sm  # Retry from Arbitrum
```

## Environment Variables Reference

```bash
# PM Network Deployer (required for PM Network scripts)
PM_NETWORK_DEPLOYER_PRIVATE_KEY=
PM_NETWORK_DEPLOYER_ADDRESS=

# SM Network Deployer (required for SM Network scripts)
SM_NETWORK_DEPLOYER_PRIVATE_KEY=
SM_NETWORK_DEPLOYER_ADDRESS=

# RPC URLs
PM_NETWORK_RPC_URL=
SM_NETWORK_RPC_URL=

# Collateral Token (existing mainnet token)
COLLATERAL_TOKEN_ADDRESS=

# LayerZero Configuration
PM_NETWORK_LZ_ENDPOINT=
PM_NETWORK_LZ_EID=
SM_NETWORK_LZ_ENDPOINT=
SM_NETWORK_LZ_EID=

# LayerZero Library/DVN Configuration (2 DVNs for production security)
PM_NETWORK_SEND_LIB=
PM_NETWORK_RECEIVE_LIB=
PM_NETWORK_DVN_1=             # First DVN
PM_NETWORK_DVN_2=             # Second DVN
PM_NETWORK_EXECUTOR=          # Optional on PM Network

SM_NETWORK_SEND_LIB=
SM_NETWORK_RECEIVE_LIB=
SM_NETWORK_DVN_1=             # First DVN
SM_NETWORK_DVN_2=             # Second DVN
SM_NETWORK_EXECUTOR=          # Required on SM Network

# Contract Verification
# PM Network (Ethereal) uses Blockscout - no API key needed, auto-verified
# SM Network (Arbitrum) uses Arbiscan
SM_NETWORK_ETHERSCAN_API_KEY=

# After deployments (add progressively, or let deploy-all.sh update automatically)
RESOLVER_ADDRESS=
PREDICTION_MARKET_ADDRESS=
FACTORY_ADDRESS=
PM_NETWORK_BRIDGE_ADDRESS=
SM_NETWORK_BRIDGE_ADDRESS=

# Optional
ULN_CONFIRMATIONS=15          # Higher for mainnet (default 15)
GRACE_PERIOD=0
MAX_MESSAGE_SIZE=10000

# Test Collateral (optional - for testing only)
COLLATERAL_NAME="Test USDe"
COLLATERAL_SYMBOL="tUSDe"
COLLATERAL_INITIAL_SUPPLY=1000000000000000000000000  # 1M tokens in wei
```

## Monitoring

Track cross-chain messages: https://layerzeroscan.com/

## Mainnet Considerations

1. **Collateral Token**: Unlike testnet, mainnet uses an existing token (USDC, WUSDe, etc.). Set `COLLATERAL_TOKEN_ADDRESS` to the real token address.

2. **Block Confirmations**: Mainnet typically requires more confirmations. The default `ULN_CONFIRMATIONS` is set to 15 for better security.

3. **Gas Costs**: Mainnet transactions cost real money. Consider using `--estimate-gas` flag first.

4. **DVN Selection**: Choose production-ready DVNs. The LayerZero DVN is recommended for security.

5. **Verification**:
   - **Ethereal (PM Network)**: Uses Blockscout at `https://explorer.ethereal.trade`. No API key needed. The deploy script automatically uses `--verifier blockscout --verifier-url https://explorer.ethereal.trade/api/`.
   - **Arbitrum (SM Network)**: Uses Arbiscan. Set `SM_NETWORK_ETHERSCAN_API_KEY` for verification.

## Contract Addresses

After deployment, update the contract addresses in `@sapience/sdk/contracts/addresses` — that file is the single source of truth. Other packages import from there:

```typescript
import {
  predictionMarketEscrow,
  manualConditionResolver,
  predictionMarketBridge,
  predictionMarketBridgeRemote,
  predictionMarketTokenFactory,
} from '@sapience/sdk/contracts/addresses';
```
