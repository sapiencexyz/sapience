# V2 Bridge Testnet Deployment

Scripts to deploy and test the V2 position token bridge on testnets (Ethereal Testnet + Arbitrum Sepolia).

## Prerequisites

1. Set environment variables in `.env`:

```bash
# RPC URLs
ETHEREAL_RPC=https://testnet.ethereal.network/rpc
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc

# LayerZero Endpoints
ETHEREAL_LZ_ENDPOINT=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
ARB_LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f

# Chain EIDs (LayerZero endpoint IDs)
ETHEREAL_EID=30391
ARB_SEPOLIA_EID=40231

# Deployer
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_ADDRESS=0x...
```

2. Fund deployer address on both chains with native tokens for gas.

## Deployment Steps

### Step 1: Deploy Factory on Arbitrum Sepolia

```bash
forge script src/scripts/v2/testnet/01_DeployFactory.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --broadcast \
  --verify
```

Save the factory address to `.env`:
```bash
FACTORY_ADDRESS=0x...
```

### Step 2: Deploy Bridge on Ethereal

```bash
forge script src/scripts/v2/testnet/02_DeployEtherealBridge.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast
```

Save the bridge address to `.env`:
```bash
ETHEREAL_BRIDGE_ADDRESS=0x...
```

### Step 3: Deploy Remote Bridge on Arbitrum Sepolia

```bash
forge script src/scripts/v2/testnet/03_DeployRemoteBridge.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --broadcast \
  --verify
```

Save the bridge address to `.env`:
```bash
ARB_BRIDGE_ADDRESS=0x...
```

### Step 4: Configure Bridges (run on both chains)

Configure Ethereal bridge:
```bash
forge script src/scripts/v2/testnet/04_ConfigureEtherealBridge.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast
```

Configure Arbitrum bridge:
```bash
forge script src/scripts/v2/testnet/05_ConfigureRemoteBridge.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --broadcast
```

### Step 5: Deploy Test Token on Ethereal

```bash
forge script src/scripts/v2/testnet/06_DeployTestToken.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast
```

Save the token address to `.env`:
```bash
TEST_TOKEN_ADDRESS=0x...
```

### Step 6: Fund Bridges for ACK Fees

Send ETH to both bridges for ACK message fees:
```bash
# On Ethereal
cast send $ETHEREAL_BRIDGE_ADDRESS --value 0.1ether --rpc-url $ETHEREAL_RPC --private-key $DEPLOYER_PRIVATE_KEY

# On Arbitrum Sepolia
cast send $ARB_BRIDGE_ADDRESS --value 0.01ether --rpc-url $ARB_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY
```

## Testing the Bridge

### Test 1: Bridge Ethereal → Arbitrum

```bash
forge script src/scripts/v2/testnet/07_TestBridgeToRemote.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast
```

This will:
1. Approve tokens to bridge
2. Quote the bridge fee
3. Call `bridge()` to send tokens to Arbitrum
4. Print the bridgeId for tracking

### Test 2: Check Bridge Status

After ~1-2 minutes (LayerZero message delivery), check on Arbitrum:

```bash
# Check if token was deployed
cast call $ARB_BRIDGE_ADDRESS "isTokenDeployed(bytes32,bool)" $PICK_CONFIG_ID true --rpc-url $ARB_SEPOLIA_RPC

# Get bridged token address
cast call $ARB_BRIDGE_ADDRESS "getTokenAddress(bytes32,bool)" $PICK_CONFIG_ID true --rpc-url $ARB_SEPOLIA_RPC

# Check recipient balance
cast call $BRIDGED_TOKEN "balanceOf(address)" $RECIPIENT --rpc-url $ARB_SEPOLIA_RPC
```

### Test 3: Bridge Back Arbitrum → Ethereal

```bash
forge script src/scripts/v2/testnet/08_TestBridgeBack.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --broadcast
```

## Verification

Check bridge configuration is complete:

```bash
# Ethereal bridge
cast call $ETHEREAL_BRIDGE_ADDRESS "isConfigComplete()" --rpc-url $ETHEREAL_RPC

# Arbitrum bridge
cast call $ARB_BRIDGE_ADDRESS "isConfigComplete()" --rpc-url $ARB_SEPOLIA_RPC
```

Check pending bridges:

```bash
cast call $ETHEREAL_BRIDGE_ADDRESS "getPendingBridges(address)" $DEPLOYER_ADDRESS --rpc-url $ETHEREAL_RPC
```

## Troubleshooting

### Bridge stuck in PENDING

If bridge doesn't complete after 1 hour, retry:

```bash
# Get quote for retry
cast call $ETHEREAL_BRIDGE_ADDRESS "quoteRetry(bytes32)" $BRIDGE_ID --rpc-url $ETHEREAL_RPC

# Retry (anyone can call)
cast send $ETHEREAL_BRIDGE_ADDRESS "retry(bytes32)" $BRIDGE_ID --value 0.01ether --rpc-url $ETHEREAL_RPC --private-key $DEPLOYER_PRIVATE_KEY
```

### Check LayerZero Message Status

Use LayerZero Scan to track messages:
- https://testnet.layerzeroscan.com/

## Contract Addresses (fill after deployment)

| Contract | Chain | Address |
|----------|-------|---------|
| PositionTokenFactory | Arbitrum Sepolia | |
| PositionTokenBridge | Ethereal Testnet | |
| PositionTokenBridgeRemote | Arbitrum Sepolia | |
| MockPositionToken | Ethereal Testnet | |
