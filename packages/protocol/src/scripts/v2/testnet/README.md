# V2 Bridge Testnet Deployment Scripts

Scripts for deploying and testing the V2 position token bridge between Ethereal and Arbitrum testnets.

## Overview

This deployment uses real PredictionMarketV2 to mint position tokens, which are then bridged between chains.

### Contracts Deployed

**On Ethereal (Source Chain):**
- CollateralToken (Mock USDC)
- ManualConditionResolver
- PredictionMarketV2
- PositionTokenBridge

**On Arbitrum (Remote Chain):**
- PositionTokenFactory
- PositionTokenBridgeRemote

## Prerequisites

1. Install Foundry
2. Set up environment variables in `.env`:

```bash
# Deployer
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_ADDRESS=0x...

# LayerZero Endpoints (V2)
# Ethereal Testnet
ETHEREAL_RPC_URL=https://testnet.ethereal.network/rpc
ETHEREAL_LZ_ENDPOINT=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
ETHEREAL_LZ_EID=30391

# Arbitrum Sepolia
ARB_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARB_LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f
ARB_LZ_EID=40231
```

3. Fund deployer address on both chains with native tokens for gas.

## Deployment Steps

### Phase 1: Deploy Ethereal Infrastructure

Run on **Ethereal Testnet**:

```bash
# 1. Deploy collateral token (mock USDC)
forge script src/scripts/v2/testnet/01_DeployCollateral.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Add to .env: COLLATERAL_TOKEN_ADDRESS=...

# 2. Deploy manual condition resolver
forge script src/scripts/v2/testnet/02_DeployResolver.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Add to .env: RESOLVER_ADDRESS=...

# 3. Deploy PredictionMarketV2
forge script src/scripts/v2/testnet/03_DeployPredictionMarket.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Add to .env: PREDICTION_MARKET_ADDRESS=...

# 5. Deploy Ethereal Bridge
forge script src/scripts/v2/testnet/05_DeployEtherealBridge.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Add to .env: ETHEREAL_BRIDGE_ADDRESS=...
```

### Phase 2: Deploy Arbitrum Infrastructure

Run on **Arbitrum Sepolia**:

```bash
# 4. Deploy Position Token Factory
forge script src/scripts/v2/testnet/04_DeployFactory.s.sol --rpc-url $ARB_RPC_URL --broadcast -vvvv

# Add to .env: FACTORY_ADDRESS=...

# 6. Deploy Remote Bridge
forge script src/scripts/v2/testnet/06_DeployRemoteBridge.s.sol --rpc-url $ARB_RPC_URL --broadcast -vvvv

# Add to .env: ARB_BRIDGE_ADDRESS=...
```

### Phase 3: Configure Bridges

```bash
# 7. Configure Ethereal Bridge (run on Ethereal)
forge script src/scripts/v2/testnet/07_ConfigureEtherealBridge.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# 8. Configure Remote Bridge (run on Arbitrum)
forge script src/scripts/v2/testnet/08_ConfigureRemoteBridge.s.sol --rpc-url $ARB_RPC_URL --broadcast -vvvv
```

### Phase 4: Mint Position Tokens

Run on **Ethereal Testnet**:

```bash
# 9. Mint position tokens via PredictionMarketV2
forge script src/scripts/v2/testnet/09_MintPositionTokens.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Add to .env:
# PREDICTOR_TOKEN_ADDRESS=...
# COUNTERPARTY_TOKEN_ADDRESS=...
# PICK_CONFIG_ID=...
# CONDITION_ID=...
```

### Phase 5: Test Bridging

```bash
# 10. Bridge tokens from Ethereal to Arbitrum
forge script src/scripts/v2/testnet/10_TestBridgeToRemote.s.sol --rpc-url $ETHEREAL_RPC_URL --broadcast -vvvv

# Wait 1-2 minutes for LayerZero delivery...

# 11. Bridge tokens back from Arbitrum to Ethereal
forge script src/scripts/v2/testnet/11_TestBridgeBack.s.sol --rpc-url $ARB_RPC_URL --broadcast -vvvv
```

### Utilities

```bash
# 12. Check deployment status
forge script src/scripts/v2/testnet/12_CheckStatus.s.sol --rpc-url $ETHEREAL_RPC_URL -vvvv
forge script src/scripts/v2/testnet/12_CheckStatus.s.sol --rpc-url $ARB_RPC_URL -vvvv
```

## Script Summary

| # | Script | Chain | Description |
|---|--------|-------|-------------|
| 01 | DeployCollateral | Ethereal | Deploy mock USDC collateral token |
| 02 | DeployResolver | Ethereal | Deploy ManualConditionResolver |
| 03 | DeployPredictionMarket | Ethereal | Deploy PredictionMarketV2 |
| 04 | DeployFactory | Arbitrum | Deploy PositionTokenFactory |
| 05 | DeployEtherealBridge | Ethereal | Deploy PositionTokenBridge |
| 06 | DeployRemoteBridge | Arbitrum | Deploy PositionTokenBridgeRemote |
| 07 | ConfigureEtherealBridge | Ethereal | Set peer, config, fund for ACKs |
| 08 | ConfigureRemoteBridge | Arbitrum | Set peer, config, factory deployer |
| 09 | MintPositionTokens | Ethereal | Mint tokens via PredictionMarketV2 |
| 10 | TestBridgeToRemote | Ethereal | Bridge tokens to Arbitrum |
| 11 | TestBridgeBack | Arbitrum | Bridge tokens back to Ethereal |
| 12 | CheckStatus | Both | View deployment status & balances |

## Environment Variables Reference

```bash
# Required for all scripts
DEPLOYER_PRIVATE_KEY=
DEPLOYER_ADDRESS=

# RPC URLs
ETHEREAL_RPC_URL=
ARB_RPC_URL=

# LayerZero Configuration
ETHEREAL_LZ_ENDPOINT=
ETHEREAL_LZ_EID=
ARB_LZ_ENDPOINT=
ARB_LZ_EID=

# After deployments (add progressively)
COLLATERAL_TOKEN_ADDRESS=
RESOLVER_ADDRESS=
PREDICTION_MARKET_ADDRESS=
FACTORY_ADDRESS=
ETHEREAL_BRIDGE_ADDRESS=
ARB_BRIDGE_ADDRESS=
PREDICTOR_TOKEN_ADDRESS=
COUNTERPARTY_TOKEN_ADDRESS=
PICK_CONFIG_ID=
CONDITION_ID=

# Optional
BRIDGE_AMOUNT=10000000000000000000  # 10 tokens in wei
```

## Monitoring

Track cross-chain messages: https://testnet.layerzeroscan.com/

## Troubleshooting

### Bridge stuck in PENDING

If bridge doesn't complete after 1 hour, retry:

```bash
# Get quote for retry
cast call $ETHEREAL_BRIDGE_ADDRESS "quoteRetry(bytes32)" $BRIDGE_ID --rpc-url $ETHEREAL_RPC_URL

# Retry (anyone can call)
cast send $ETHEREAL_BRIDGE_ADDRESS "retry(bytes32,bytes32)" $BRIDGE_ID 0x0 --value 0.01ether --rpc-url $ETHEREAL_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
```

### Check LayerZero Message Status

Use LayerZero Scan to track messages:
- https://testnet.layerzeroscan.com/

## Notes

- The mint script uses the deployer as both predictor and counterparty for simplicity
- Position tokens represent real prediction market positions
- Bridge flow: Ethereal (escrow) -> Arbitrum (mint) -> Ethereal (release)
- ACK mechanism ensures atomic bridging

## Contract Addresses (fill after deployment)

| Contract | Chain | Address |
|----------|-------|---------|
| CollateralToken | Ethereal | |
| ManualConditionResolver | Ethereal | |
| PredictionMarketV2 | Ethereal | |
| PositionTokenFactory | Arbitrum | |
| PositionTokenBridge | Ethereal | |
| PositionTokenBridgeRemote | Arbitrum | |
