#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Verify ConditionalTokensReader on Polygon
# ============================================================================
#
# This script verifies the deployed ConditionalTokensReader contract on Polygon
# using the constructor arguments from environment variables.
#
# Prerequisites:
#   - POLYGONSCAN_API_KEY set in environment
#   - POLYGON_CONDITIONAL_TOKENS_READER set (deployed contract address)
#   - POLYGON_LZ_ENDPOINT, POLYGON_OWNER set (constructor args)
#   - cast installed (for encoding constructor args)
#
# Usage:
#   bash src/scripts/DeployConditionalTokensResolver/verify_polygon.sh
#
# ============================================================================

# Resolve directories
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)

# Load environment variables
if [[ -f "$PROTOCOL_DIR/.env.deployments" ]]; then
  echo "Loading environment from $PROTOCOL_DIR/.env.deployments"
  set -a
  source "$PROTOCOL_DIR/.env.deployments"
  set +a
fi

# Check for required variables
if [[ -z "${POLYGONSCAN_API_KEY:-}" ]]; then
  echo "ERROR: POLYGONSCAN_API_KEY is not set"
  echo ""
  echo "Please set it in your environment:"
  echo "  export POLYGONSCAN_API_KEY=your_api_key_here"
  exit 1
fi

if [[ -z "${POLYGON_CONDITIONAL_TOKENS_READER:-}" ]]; then
  echo "ERROR: POLYGON_CONDITIONAL_TOKENS_READER is not set"
  echo ""
  echo "Please set the deployed contract address:"
  echo "  export POLYGON_CONDITIONAL_TOKENS_READER=0x..."
  exit 1
fi

if [[ -z "${POLYGON_LZ_ENDPOINT:-}" ]]; then
  echo "ERROR: POLYGON_LZ_ENDPOINT is not set"
  exit 1
fi

if [[ -z "${POLYGON_OWNER:-}" ]]; then
  echo "ERROR: POLYGON_OWNER is not set"
  exit 1
fi

# Use default ConditionalTokens address if not set
CONDITIONAL_TOKENS="${POLYGON_CONDITIONAL_TOKENS:-0x4D97DCd97eC945f40cF65F87097ACe5EA0476045}"

# Contract details
CONTRACT_ADDRESS="$POLYGON_CONDITIONAL_TOKENS_READER"
CONTRACT_PATH="src/predictionMarket/resolvers/ConditionalTokensReader.sol:ConditionalTokensReader"
CHAIN_ID=137  # Polygon Mainnet

# Constructor arguments
ENDPOINT="$POLYGON_LZ_ENDPOINT"
OWNER="$POLYGON_OWNER"

echo "=== Verifying ConditionalTokensReader on Polygon ==="
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Chain ID: $CHAIN_ID"
echo "Endpoint: $ENDPOINT"
echo "Owner: $OWNER"
echo "ConditionalTokens: $CONDITIONAL_TOKENS"
echo ""

# Encode constructor arguments
echo "Encoding constructor arguments..."
CONSTRUCTOR_ARGS=$(cast abi-encode \
  "constructor(address,address,(address))" \
  "$ENDPOINT" \
  "$OWNER" \
  "($CONDITIONAL_TOKENS)")

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to encode constructor arguments"
  exit 1
fi

echo "Constructor args encoded successfully"
echo ""

# Verify the contract
echo "Verifying contract on Polygon..."
cd "$PROTOCOL_DIR"

forge verify-contract \
  "$CONTRACT_ADDRESS" \
  "$CONTRACT_PATH" \
  --chain-id "$CHAIN_ID" \
  --etherscan-api-key "$POLYGONSCAN_API_KEY" \
  --constructor-args "$CONSTRUCTOR_ARGS"

if [[ $? -eq 0 ]]; then
  echo ""
  echo "✅ Contract verified successfully!"
  echo "View on Polygonscan: https://polygonscan.com/address/$CONTRACT_ADDRESS#code"
else
  echo ""
  echo "❌ Verification failed. Check the error message above."
  exit 1
fi

