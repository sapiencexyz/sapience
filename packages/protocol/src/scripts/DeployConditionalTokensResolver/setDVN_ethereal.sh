#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Configure LayerZero DVN for Ethereal Resolver (RECEIVE side)
# Using cast commands directly
# ============================================================================

# Configuration - UPDATE THESE VALUES
RESOLVER="${ETHEREAL_CONDITIONAL_TOKENS_RESOLVER:-0x...}"
ENDPOINT="${ETHEREAL_LZ_ENDPOINT:-0x6F475642a6e85809B1c36Fa62763669b1b48DD5B}"
RECEIVE_LIB="${ETHEREAL_RECEIVE_LIB:-0x...}"
DVN="${ETHEREAL_DVN:-0x...}"
POLYGON_EID="${POLYGON_EID:-30109}"
CONFIRMATIONS="${ULN_CONFIRMATIONS:-20}"
REQUIRED_DVN_COUNT="${REQUIRED_DVN_COUNT:-1}"

# Required - Set these before running
RPC_URL="${ETHEREAL_RPC:-https://rpc.ethereal.trade}"
PRIVATE_KEY="${ETHEREAL_PRIVATE_KEY:-}"

if [[ -z "$PRIVATE_KEY" ]]; then
  echo "ERROR: ETHEREAL_PRIVATE_KEY is not set"
  echo "Export it: export ETHEREAL_PRIVATE_KEY=0x..."
  exit 1
fi

if [[ "$RESOLVER" == "0x..." ]]; then
  echo "ERROR: ETHEREAL_CONDITIONAL_TOKENS_RESOLVER is not set"
  exit 1
fi

echo "=== Configuring LayerZero DVN for Ethereal Resolver (RECEIVE) ==="
echo "Resolver: $RESOLVER"
echo "Endpoint: $ENDPOINT"
echo "Receive Library: $RECEIVE_LIB"
echo "DVN: $DVN"
echo "Source EID (Polygon): $POLYGON_EID"
echo "Confirmations: $CONFIRMATIONS"
echo ""

# Step 1: Set receive library
echo "Step 1: Setting receive library..."
cast send "$ENDPOINT" \
  "setReceiveLibrary(address,uint32,address,uint32)" \
  "$RESOLVER" \
  "$POLYGON_EID" \
  "$RECEIVE_LIB" \
  "0" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
echo "✓ Receive library set"
echo ""

# Step 2: Encode UlnConfig for receive
# UlnConfig(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)
echo "Step 2: Encoding UlnConfig..."
ULN_CONFIG=$(cast abi-encode \
  "f(uint64,uint8,uint8,uint8,address[],address[])" \
  "$CONFIRMATIONS" \
  "$REQUIRED_DVN_COUNT" \
  "255" \
  "0" \
  "[$DVN]" \
  "[]")
echo "UlnConfig: $ULN_CONFIG"
echo ""

# Step 3: Call setConfig for receive
# setConfig(address oapp, address lib, (uint32,uint32,bytes)[] params)
# params[0] = (eid=30109, configType=2 (ULN/RECEIVE), config=ulnConfig)
echo "Step 3: Setting receive config (DVN)..."
cast send "$ENDPOINT" \
  "setConfig(address,address,(uint32,uint32,bytes)[])" \
  "$RESOLVER" \
  "$RECEIVE_LIB" \
  "[($POLYGON_EID,2,$ULN_CONFIG)]" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"

echo ""
echo "=== Configuration Complete ==="
echo "Ethereal resolver is now configured to receive messages from Polygon"

