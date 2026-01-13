# ConditionalTokens Resolver Deployment & Testing Guide

This directory contains scripts for deploying and testing the ConditionalTokens resolution system between Polygon and Ethereal networks.

## Architecture

- **Polygon**: `ConditionalTokensReader` - Reads ConditionalTokens and sends resolution data
- **Ethereal**: `PredictionMarketLZConditionalTokensResolver` - Receives resolution data and caches outcomes

## Prerequisites

### Environment Variables

**IMPORTANT**: Forge requires a plain text `.env` file. If your `.env` file is in RAGE Package Format (RPF) or another format, you have two options:

1. **Export variables directly** (recommended for scripts):
```bash
export POLYGON_LZ_ENDPOINT=0x1a44076050125825900e736c501f859c50fE728c
export POLYGON_OWNER=0x...
export POLYGON_PRIVATE_KEY=0x...
export POLYGON_RPC=https://polygon-rpc.com
export POLYGON_CONDITIONAL_TOKENS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
export POLYGON_EID=30109

export ETHEREAL_LZ_ENDPOINT=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
export ETHEREAL_OWNER=0x...
export ETHEREAL_PRIVATE_KEY=0x...
export ETHEREAL_RPC=https://rpc.ethereal.trade
export ETHEREAL_EID=30391
```

2. **Create a plain text `.env` file** in `packages/protocol/`:
```bash
# Polygon Configuration
POLYGON_LZ_ENDPOINT=0x1a44076050125825900e736c501f859c50fE728c
POLYGON_OWNER=0x...
POLYGON_PRIVATE_KEY=0x...
POLYGON_RPC=https://polygon-rpc.com
POLYGON_CONDITIONAL_TOKENS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
POLYGON_EID=30109

# Ethereal Configuration  
ETHEREAL_LZ_ENDPOINT=0x6F475642a6e85809B1c36Fa62763669b1b48DD5B
ETHEREAL_OWNER=0x...
ETHEREAL_PRIVATE_KEY=0x...
ETHEREAL_RPC=https://rpc.ethereal.trade
ETHEREAL_EID=30391

# After Deployment
POLYGON_CONDITIONAL_TOKENS_READER=0x...
ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=0x...

# For Verification (Polygon)
POLYGONSCAN_API_KEY=your_api_key_here

# For Testing
TEST_CONDITION_ID=0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc
PM_MAX_MARKETS=20
```

### Finding LayerZero Endpoint IDs

You can find LayerZero endpoint IDs (EIDs) at:
- LayerZero Docs: https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids
- Or check the endpoint contract directly

## Deployment Steps

### Quick Start: Automated Deployment Script

For convenience, you can use the orchestration script to deploy and configure everything in one go:

```bash
bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh
```

**With automatic verification:**
```bash
bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh --verify
```

**Skip steps if contracts already deployed:**
```bash
# Skip Polygon deployment (use existing POLYGON_CONDITIONAL_TOKENS_READER)
bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh --skip-polygon

# Skip Ethereal deployment (use existing ETHEREAL_CONDITIONAL_TOKENS_RESOLVER)
bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh --skip-ethereal

# Skip configuration (only deploy)
bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh --skip-config
```

The script will:
1. Check all required environment variables
2. Deploy ConditionalTokensReader on Polygon
3. Deploy Resolver on Ethereal
4. Configure both contracts

### Manual Deployment Steps

If you prefer to run each step manually:

#### Step 1: Deploy and Verify ConditionalTokensReader on Polygon

```bash
forge script src/scripts/DeployConditionalTokensResolver/01_Polygon_deployReader.s.sol \
  --rpc-url $POLYGON_RPC \
  --broadcast \
  --private-key $POLYGON_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $POLYGONSCAN_API_KEY \
  -vvvv
```

**Note**: The `--verify` flag will automatically verify the contract on Polygonscan. If verification fails or you want to verify manually later, the script outputs the verification command with encoded constructor arguments.

**Save the deployed address** and set:
```bash
export POLYGON_CONDITIONAL_TOKENS_READER=0x...
```

### Step 2: Deploy and Verify Resolver on Ethereal

```bash
forge script src/scripts/DeployConditionalTokensResolver/02_Ethereal_deployResolver.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast \
  --private-key $ETHEREAL_PRIVATE_KEY \
  -vvvv
```

**Note**: Ethereal uses a custom explorer at https://explorer.ethereal.trade. The script outputs the encoded constructor arguments for manual verification. Forge's built-in verification may not work for custom explorers.

**Save the deployed address** and set:
```bash
export ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=0x...
```

### Step 3: Configure Both Contracts

Configure Polygon reader (sets Ethereal resolver as remote):
```bash
forge script src/scripts/DeployConditionalTokensResolver/03_Polygon_configureReader.s.sol \
  --rpc-url $POLYGON_RPC \
  --broadcast \
  --private-key $POLYGON_PRIVATE_KEY \
  -vvvv
```

Configure Ethereal resolver (sets Polygon reader as remote):
```bash
forge script src/scripts/DeployConditionalTokensResolver/04_Ethereal_configureResolver.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast \
  --private-key $ETHEREAL_PRIVATE_KEY \
  -vvvv
```

### Step 4: Configure LayerZero DVNs and Libraries

**Option A: Using Bash Scripts (Recommended if forge scripts fail)**

**Configure Polygon Reader (SEND side)**:
```bash
export POLYGON_PRIVATE_KEY=0x...
export POLYGON_RPC=https://polygon-rpc.com
bash src/scripts/DeployConditionalTokensResolver/setDVN_polygon.sh
```

**Configure Ethereal Resolver (RECEIVE side)**:
```bash
export ETHEREAL_PRIVATE_KEY=0x...
export ETHEREAL_RPC=https://rpc.ethereal.trade
export ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=0x...
export ETHEREAL_RECEIVE_LIB=0x...
export ETHEREAL_DVN=0x...
bash src/scripts/DeployConditionalTokensResolver/setDVN_ethereal.sh
```

**Option B: Using Forge Scripts**

**Configure Polygon Reader (SEND side)** - Sets send library, DVNs, and confirmations:
```bash
forge script src/scripts/DeployConditionalTokensResolver/05_Polygon_setDVN.s.sol \
  --rpc-url $POLYGON_RPC \
  --broadcast \
  --private-key $POLYGON_PRIVATE_KEY \
  -vvvv
```

**Configure Ethereal Resolver (RECEIVE side)** - Sets receive library, DVNs, and confirmations:
```bash
forge script src/scripts/DeployConditionalTokensResolver/06_Ethereal_setDVN.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast \
  --private-key $ETHEREAL_PRIVATE_KEY \
  -vvvv
```

**Option C: Manual Cast Commands**

See `CAST_COMMANDS.md` for step-by-step cast commands you can run manually.

**Required environment variables for DVN configuration:**

```bash
# Polygon (Sender)
POLYGON_SEND_LIB=0x...        # SendUln302 address on Polygon
POLYGON_DVN=0x...            # Required DVN address on Polygon
POLYGON_EXECUTOR=0x...       # Executor address (or 0x0 for default)

# Ethereal (Receiver)
ETHEREAL_RECEIVE_LIB=0x...    # ReceiveUln302 address on Ethereal
ETHEREAL_DVN=0x...           # Required DVN address on Ethereal

# Optional (with defaults)
ULN_CONFIRMATIONS=20         # Block confirmations (default: 20)
REQUIRED_DVN_COUNT=1         # Required DVN count (default: 1)
MAX_MESSAGE_SIZE=10000        # Max message size (default: 10000)
GRACE_PERIOD=0               # Grace period for library switch (default: 0)
```

**Finding LayerZero Library Addresses:**

You can find the official LayerZero library addresses at:
- LayerZero Docs: https://layerzero.gitbook.io/docs/technical-reference/mainnet/libraries
- Or check the endpoint contract directly on each chain

## Testing

### Test the Full Flow

1. **Request Resolution** (on Polygon):
```bash
forge script src/scripts/DeployConditionalTokensResolver/07_Polygon_testFlow.s.sol \
  --rpc-url $POLYGON_RPC \
  --broadcast \
  --private-key $POLYGON_PRIVATE_KEY \
  -vvvv
```

This will:
- Quote the fee for sending resolution data
- Call `requestResolution()` which:
  - Reads ConditionalTokens data (denom, noPayout, yesPayout)
  - Validates it's binary and resolved
  - Sends data to Ethereal resolver via LayerZero

2. **Wait for Message Delivery** (~30-60 seconds)

3. **Verify Resolution** (on Ethereal):
```bash
forge script src/scripts/DeployConditionalTokensResolver/08_Ethereal_verifyResolution.s.sol \
  --rpc-url $ETHEREAL_RPC \
  -vvvv
```

This will show:
- Whether the condition was received
- If it's settled
- The resolution outcome (YES/NO)
- Payout values

## Manual Testing with cast

### Quote Fee (read-only)
```bash
cast call $POLYGON_CONDITIONAL_TOKENS_READER \
  "quoteResolution(bytes32)((uint256,uint256))" \
  $TEST_CONDITION_ID \
  --rpc-url $POLYGON_RPC
```

### Request Resolution
```bash
# First get the fee
FEE=$(cast call $POLYGON_CONDITIONAL_TOKENS_READER \
  "quoteResolution(bytes32)((uint256,uint256))" \
  $TEST_CONDITION_ID \
  --rpc-url $POLYGON_RPC | head -1)

# Send request with fee
cast send $POLYGON_CONDITIONAL_TOKENS_READER \
  "requestResolution(bytes32)" \
  $TEST_CONDITION_ID \
  --value $FEE \
  --private-key $POLYGON_PRIVATE_KEY \
  --rpc-url $POLYGON_RPC
```

### Check Resolver State
```bash
cast call $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  "getCondition(bytes32)((bytes32,bool,bool,bool,uint256,uint256,uint256,uint64))" \
  $TEST_CONDITION_ID \
  --rpc-url $ETHEREAL_RPC
```

## Troubleshooting

### .env File Issues

If you get parsing errors like "EOF while parsing a string", check:
1. Your `.env` file is plain text (not RPF or other formats)
2. No unclosed quotes
3. No special characters causing issues
4. Use `export` variables directly if `.env` parsing fails

### Message Not Received

1. **Check Peer Configuration**:
```bash
# On Polygon - check peer for Ethereal EID
cast call $POLYGON_CONDITIONAL_TOKENS_READER \
  "peers(uint32)(bytes32)" \
  $ETHEREAL_EID \
  --rpc-url $POLYGON_RPC

# On Ethereal - check peer for Polygon EID  
cast call $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  "peers(uint32)(bytes32)" \
  $POLYGON_EID \
  --rpc-url $ETHEREAL_RPC
```

2. **Check Bridge Config**:
```bash
# Polygon reader bridge config
cast call $POLYGON_CONDITIONAL_TOKENS_READER \
  "getBridgeConfig()((uint32,address))" \
  --rpc-url $POLYGON_RPC

# Ethereal resolver bridge config
cast call $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  "getBridgeConfig()((uint32,address))" \
  --rpc-url $ETHEREAL_RPC
```

3. **Verify LayerZero Message Status**:
   - Check LayerZero scan: https://layerzeroscan.com/
   - Look up the transaction hash from `requestResolution()`

### Invalid Condition Errors

If you get `ConditionIsNotBinary`, `ConditionNotResolved`, or `InvalidPayout`:
- The condition must have exactly 2 outcomes (binary)
- The condition must be resolved on Polygon (`payoutDenominator > 0`)
- Payouts must sum to denominator and be different (strict binary)

### Fee Issues

- Make sure you send enough ETH with `requestResolution()`
- Use `quoteResolution()` to get the exact fee needed
- Fees are paid in native token (MATIC on Polygon, USDe on Ethereal)

## Expected Flow

1. User calls `ConditionalTokensReader.requestResolution(conditionId)` on Polygon with ETH
2. Reader validates condition is binary and resolved
3. Reader reads payoutDenominator, noPayout, yesPayout from ConditionalTokens
4. Reader sends encoded message to Ethereal resolver via LayerZero
5. Ethereal resolver receives message in `_lzReceive()`
6. Resolver validates sender and decodes resolution data
7. Resolver calls `_finalizeResolution()` to cache the outcome
8. Resolver can now answer `getPredictionResolution()` queries

## Contract Verification

### Polygon (Automatic)

Verification is included in the deployment script (Step 1). Simply add the `--verify` flag:

```bash
forge script src/scripts/DeployConditionalTokensResolver/01_Polygon_deployReader.s.sol \
  --rpc-url $POLYGON_RPC \
  --broadcast \
  --private-key $POLYGON_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $POLYGONSCAN_API_KEY \
  -vvvv
```

If automatic verification fails, the deployment script outputs the exact `forge verify-contract` command with encoded constructor arguments that you can run manually.

**Alternative: Using the verification bash script**
```bash
# Make sure you have POLYGONSCAN_API_KEY set
export POLYGONSCAN_API_KEY=your_api_key_here

# Run the verification script
bash src/scripts/DeployConditionalTokensResolver/verify_polygon.sh
```

**Note**: Polygon Mainnet chain ID is `137`. Make sure you have a Polygonscan API key (not Etherscan).

### Ethereal (Blockscout)

Ethereal uses Blockscout explorer at https://explorer.ethereal.trade. You can verify contracts using forge with the Blockscout verifier:

**Automatic verification during deployment:**
```bash
forge script src/scripts/DeployConditionalTokensResolver/02_Ethereal_deployResolver.s.sol \
  --rpc-url $ETHEREAL_RPC \
  --broadcast \
  --private-key $ETHEREAL_PRIVATE_KEY \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv
```

**Manual verification after deployment:**
```bash
# Get the constructor args from the deployment script output or broadcast JSON
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address,(uint256))" $ENDPOINT $OWNER "($MAX_MARKETS)")

forge verify-contract \
  $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol:PredictionMarketLZConditionalTokensResolver \
  --chain-id 5066318 \
  --constructor-args $CONSTRUCTOR_ARGS \
  --verifier blockscout \
  --verifier-url https://explorer.ethereal.trade/api/ \
  --watch
```

**Note**: Always include `--verifier blockscout --verifier-url https://explorer.ethereal.trade/api/` when verifying on Ethereal.

## Next Steps

After successful testing:
- Deploy to production networks
- Verify contracts on block explorers
- Set up monitoring for resolution requests
- Consider adding rate limiting or access controls if needed
