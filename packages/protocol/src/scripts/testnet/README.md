# Bridge Testnet Deployment Scripts

Scripts for deploying and testing the position token bridge between PM Network and SM Network testnets.

## Overview

This deployment uses real PredictionMarketEscrow to mint position tokens, which are then bridged between chains.

### Contracts Deployed

**On PM Network (Source Chain):**

- CollateralToken (Mock USDC)
- ManualConditionResolver
- PredictionMarketEscrow
- PredictionMarketBridge

**On SM Network (Remote Chain):**

- PredictionMarketTokenFactory
- PredictionMarketBridgeRemote

## Prerequisites

1. Install Foundry
2. Set up environment variables in `.env`:

```bash
# Deployer (deploys contracts and funds predictor/counterparty)
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_ADDRESS=0x...

# Predictor and Counterparty (separate addresses for testing mint/bridge)
PREDICTOR_PRIVATE_KEY=0x...
COUNTERPARTY_PRIVATE_KEY=0x...

# LayerZero Endpoints (V2)
# PM Network
PM_NETWORK_RPC_URL=https://testnet.ethereal.network/rpc
PM_NETWORK_LZ_ENDPOINT=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
PM_NETWORK_LZ_EID=30391

# SM Network
SM_NETWORK_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
SM_NETWORK_LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f
SM_NETWORK_LZ_EID=40231

# LayerZero Library and DVN Configuration (required for cross-chain messaging)
# PM Network
PM_NETWORK_SEND_LIB=0x...       # SendUln302 address on PM Network
PM_NETWORK_RECEIVE_LIB=0x...    # ReceiveUln302 address on PM Network
PM_NETWORK_DVN=0x...            # DVN address on PM Network
PM_NETWORK_EXECUTOR=0x...       # Executor address on PM Network (optional)

# SM Network
SM_NETWORK_SEND_LIB=0x...            # SendUln302 address on SM Network
SM_NETWORK_RECEIVE_LIB=0x...         # ReceiveUln302 address on SM Network
SM_NETWORK_DVN=0x...                 # DVN address on SM Network
SM_NETWORK_EXECUTOR=0x...            # Executor address on SM Network
```

3. Fund deployer address on both chains with native tokens for gas.

**Finding LayerZero addresses:** Check https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts for endpoint addresses, and https://docs.layerzero.network/v2/developers/evm/technical-reference/dvn-addresses for DVN addresses.

## Deployment Steps

### Phase 1: Deploy Ethereal Infrastructure

Run on **PM Network**:

```bash
# 1. Deploy collateral token (mock USDC)
forge script src/scripts/testnet/01_DeployCollateral.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: COLLATERAL_TOKEN_ADDRESS=...

# 2. Deploy manual condition resolver
forge script src/scripts/testnet/02_DeployResolver.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: RESOLVER_ADDRESS=...

# 3. Deploy PredictionMarketEscrow
forge script src/scripts/testnet/03_DeployPredictionMarket.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: PREDICTION_MARKET_ADDRESS=...

# 5. Deploy Ethereal Bridge
forge script src/scripts/testnet/05_DeployEtherealBridge.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: PM_NETWORK_BRIDGE_ADDRESS=...
```

### Phase 2: Deploy Arbitrum Infrastructure

Run on **SM Network**:

```bash
# 4. Deploy Position Token Factory
forge script src/scripts/testnet/04_DeployFactory.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: FACTORY_ADDRESS=...

# 6. Deploy Remote Bridge
forge script src/scripts/testnet/06_DeployRemoteBridge.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env: SM_NETWORK_BRIDGE_ADDRESS=...
```

### Phase 3: Configure Bridges

```bash
# 7. Configure Ethereal Bridge (run on PM Network)
forge script src/scripts/testnet/07_ConfigureEtherealBridge.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# 7b. Set DVN/Libraries for Ethereal Bridge
forge script src/scripts/testnet/07b_SetDVN_EtherealBridge.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# 8. Configure Remote Bridge (run on SM Network)
forge script src/scripts/testnet/08_ConfigureRemoteBridge.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv

# 8b. Set DVN/Libraries for Remote Bridge
forge script src/scripts/testnet/08b_SetDVN_RemoteBridge.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv
```

### Phase 4: Mint Position Tokens

Run on **PM Network**:

```bash
# 9. Mint position tokens via PredictionMarketEscrow
forge script src/scripts/testnet/09_MintPredictionMarketTokens.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Add to .env:
# PREDICTOR_TOKEN_ADDRESS=...
# COUNTERPARTY_TOKEN_ADDRESS=...
# PICK_CONFIG_ID=...
# CONDITION_ID=...
```

### Phase 5: Test Bridging

```bash
# 10. Bridge tokens from PM Network to SM Network
forge script src/scripts/testnet/10_TestBridgeToRemote.s.sol --rpc-url $PM_NETWORK_RPC_URL --broadcast -vvvv

# Wait 1-2 minutes for LayerZero delivery...

# 11. Bridge tokens back from SM Network to PM Network
forge script src/scripts/testnet/11_TestBridgeBack.s.sol --rpc-url $SM_NETWORK_RPC_URL --broadcast -vvvv
```

### Utilities

```bash
# 12a. Check PM Network status
forge script src/scripts/testnet/12a_CheckStatus_PMNetwork.s.sol --rpc-url $PM_NETWORK_RPC_URL -vvvv

# 12b. Check SM Network status
forge script src/scripts/testnet/12b_CheckStatus_SMNetwork.s.sol --rpc-url $SM_NETWORK_RPC_URL -vvvv
```

## Script Summary

| #   | Script                     | Chain    | Description                                     |
| --- | -------------------------- | -------- | ----------------------------------------------- |
| 01  | DeployCollateral           | Ethereal | Deploy mock USDC collateral token               |
| 02  | DeployResolver             | Ethereal | Deploy ManualConditionResolver                  |
| 03  | DeployPredictionMarket     | Ethereal | Deploy PredictionMarketEscrow                   |
| 04  | DeployFactory              | Arbitrum | Deploy PredictionMarketTokenFactory             |
| 05  | DeployEtherealBridge       | Ethereal | Deploy PredictionMarketBridge                   |
| 06  | DeployRemoteBridge         | Arbitrum | Deploy PredictionMarketBridgeRemote             |
| 07  | ConfigureEtherealBridge    | Ethereal | Set peer and bridge config                      |
| 07b | SetDVN_EtherealBridge      | Ethereal | Set SendLib, ReceiveLib, DVN config             |
| 08  | ConfigureRemoteBridge      | Arbitrum | Set peer, config, factory deployer              |
| 08b | SetDVN_RemoteBridge        | Arbitrum | Set SendLib, ReceiveLib, DVN, Executor          |
| 09  | MintPredictionMarketTokens | Ethereal | Mint tokens (predictor/counterparty collateral) |
| 10  | TestBridgeToRemote         | Ethereal | Predictor bridges tokens to SM Network          |
| 11  | TestBridgeBack             | Arbitrum | Predictor bridges tokens back to PM Network     |
| 12a | CheckStatus_PMNetwork      | Ethereal | View PM Network deployment status & balances    |
| 12b | CheckStatus_SMNetwork      | Arbitrum | View SM Network deployment status & balances    |

## Automated Deployment

Use the `deploy-all.sh` script to run all steps automatically:

```bash
# Full deployment with DVN config and mint
./src/scripts/testnet/deploy-all.sh all

# Deploy and configure only (no mint)
./src/scripts/testnet/deploy-all.sh deploy

# Run individual phases
./src/scripts/testnet/deploy-all.sh phase1    # Ethereal infrastructure
./src/scripts/testnet/deploy-all.sh phase2    # Arbitrum infrastructure
./src/scripts/testnet/deploy-all.sh phase3    # Basic bridge config
./src/scripts/testnet/deploy-all.sh phase3b   # DVN/library config
./src/scripts/testnet/deploy-all.sh phase4    # Mint tokens
./src/scripts/testnet/deploy-all.sh status    # Check status
```

## Environment Variables Reference

```bash
# Required for all scripts
DEPLOYER_PRIVATE_KEY=
DEPLOYER_ADDRESS=

# Required for mint and bridge testing (scripts 09-11)
PREDICTOR_PRIVATE_KEY=
COUNTERPARTY_PRIVATE_KEY=

# RPC URLs
PM_NETWORK_RPC_URL=
SM_NETWORK_RPC_URL=

# LayerZero Configuration
PM_NETWORK_LZ_ENDPOINT=
PM_NETWORK_LZ_EID=
SM_NETWORK_LZ_ENDPOINT=
SM_NETWORK_LZ_EID=

# LayerZero Library/DVN Configuration (required for cross-chain messaging)
PM_NETWORK_SEND_LIB=
PM_NETWORK_RECEIVE_LIB=
PM_NETWORK_DVN=
PM_NETWORK_EXECUTOR=          # Optional on PM Network

SM_NETWORK_SEND_LIB=
SM_NETWORK_RECEIVE_LIB=
SM_NETWORK_DVN=
SM_NETWORK_EXECUTOR=               # Required on SM Network

# Contract Verification (optional - if API key is set, contracts will be verified on deploy)
# Forge auto-detects verifier URL for known chains (Sepolia, Arbitrum Sepolia, etc.)
PM_NETWORK_ETHERSCAN_API_KEY=your_etherscan_api_key
SM_NETWORK_ETHERSCAN_API_KEY=your_arbiscan_api_key

# Custom verifier URLs (optional - only needed for unknown chains)
# PM_NETWORK_VERIFIER_URL=https://api-sepolia.etherscan.io/api
# SM_NETWORK_VERIFIER_URL=https://api-sepolia.arbiscan.io/api

# After deployments (add progressively, or let deploy-all.sh update automatically)
COLLATERAL_TOKEN_ADDRESS=
RESOLVER_ADDRESS=
PREDICTION_MARKET_ADDRESS=
FACTORY_ADDRESS=
PM_NETWORK_BRIDGE_ADDRESS=
SM_NETWORK_BRIDGE_ADDRESS=
PREDICTOR_TOKEN_ADDRESS=
COUNTERPARTY_TOKEN_ADDRESS=
PICK_CONFIG_ID=
CONDITION_ID=

# Optional
BRIDGE_AMOUNT=10000000000000000000  # 10 tokens in wei
ULN_CONFIRMATIONS=1                 # Block confirmations for DVN
GRACE_PERIOD=0                      # Grace period for library switch
MAX_MESSAGE_SIZE=10000              # Max message size for executor
```

## Monitoring

Track cross-chain messages: https://testnet.layerzeroscan.com/

## Troubleshooting

### Bridge stuck in PENDING

If bridge doesn't complete after 1 hour, retry:

```bash
# Get quote for retry
cast call $PM_NETWORK_BRIDGE_ADDRESS "quoteRetry(bytes32)" $BRIDGE_ID --rpc-url $PM_NETWORK_RPC_URL

# Retry (anyone can call)
cast send $PM_NETWORK_BRIDGE_ADDRESS "retry(bytes32,bytes32)" $BRIDGE_ID 0x0 --value 0.01ether --rpc-url $PM_NETWORK_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
```

### Check LayerZero Message Status

Use LayerZero Scan to track messages:

- https://testnet.layerzeroscan.com/

## Notes

- The mint script uses separate predictor and counterparty addresses (deployer funds both with collateral)
- Predictor and counterparty each sign their own approvals for mint
- Bridge testing uses the predictor's tokens and private key
- Position tokens represent real prediction market positions
- Bridge flow: Ethereal (escrow) -> Arbitrum (mint) -> Ethereal (release)
- ACK mechanism ensures atomic bridging

## Contract Addresses

After deployment, update the contract addresses in `@sapience/sdk/contracts/addresses` — that file is the single source of truth. Other packages import from there:

```typescript
import {
  predictionMarketEscrow,
  manualConditionResolver,
  predictionMarketBridge,
  predictionMarketBridgeRemote,
  predictionMarketTokenFactory,
  collateralToken,
} from '@sapience/sdk/contracts/addresses';
```
