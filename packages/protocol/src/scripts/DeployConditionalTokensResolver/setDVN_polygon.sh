#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Configure LayerZero DVN for Polygon ConditionalTokensReader (SEND side)
# Using cast commands directly
# ============================================================================

# Configuration - UPDATE THESE VALUES
READER="0x26DB702647e56B230E15687bFbC48b526E131dAe"
ENDPOINT="0x1a44076050125825900e736c501f859c50fE728c"
SEND_LIB="0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3"
EXECUTOR="0xCd3F213AD101472e1713C72B1697E727C803885b"
ETHEREAL_EID="30110"
DVN1="0x23DE2FE932d9043291f870324B74F820e11dc81A"
# DVN2="0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc"
CONFIRMATIONS="20"
# REQUIRED_DVN_COUNT="2"
REQUIRED_DVN_COUNT="1"
MAX_MESSAGE_SIZE="10000"

# Required - Set these before running
RPC_URL="${POLYGON_RPC:-https://polygon-rpc.com}"
PRIVATE_KEY="${POLYGON_PRIVATE_KEY:-}"

if [[ -z "$PRIVATE_KEY" ]]; then
  echo "ERROR: POLYGON_PRIVATE_KEY is not set"
  echo "Export it: export POLYGON_PRIVATE_KEY=0x..."
  exit 1
fi

echo "=== Configuring LayerZero DVN for Polygon Reader (SEND) ==="
echo "Reader: $READER"
echo "Endpoint: $ENDPOINT"
echo "Send Library: $SEND_LIB"
echo "Executor: $EXECUTOR"
echo "Destination EID: $ETHEREAL_EID"
echo "DVN1: $DVN1"
# echo "DVN2: $DVN2"
echo ""

# Step 1: Set send library
# echo "Step 1: Setting send library..."
# cast send "$ENDPOINT" \
#   "setSendLibrary(address,uint32,address)" \
#   "$READER" \
#   "$ETHEREAL_EID" \
#   "$SEND_LIB" \
#   --rpc-url "$RPC_URL" \
#   --private-key "$PRIVATE_KEY"
# echo "✓ Send library set"
# echo ""

# Step 2: Encode ExecutorConfig
# ExecutorConfig(uint32 maxMessageSize, address executor)
echo "Step 2: Encoding ExecutorConfig..."
EXECUTOR_CONFIG=$(cast abi-encode "f(uint32,address)" "$MAX_MESSAGE_SIZE" "$EXECUTOR")
echo "ExecutorConfig: $EXECUTOR_CONFIG"
echo ""

# Step 3: Encode UlnConfig
# UlnConfig(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)
# optionalDVNCount = 255 (type(uint8).max)
echo "Step 3: Encoding UlnConfig..."
ULN_CONFIG=$(cast abi-encode \
  "f(uint64,uint8,uint8,uint8,address[],address[])" \
  "$CONFIRMATIONS" \
  "$REQUIRED_DVN_COUNT" \
  "255" \
  "0" \
  "[$DVN1]" \
  "[]")
echo "UlnConfig: $ULN_CONFIG"
echo ""

# Step 4: Call setConfig with both configs
# setConfig(address oapp, address lib, (uint32,uint32,bytes)[] params)
# params[0] = (eid=30110, configType=1 (EXECUTOR), config=executorConfig)
# params[1] = (eid=30110, configType=2 (ULN), config=ulnConfig)
echo "Step 4: Setting config (executor + DVN)..."
cast send "$ENDPOINT" \
  "setConfig(address,address,(uint32,uint32,bytes)[])" \
  "$READER" \
  "$SEND_LIB" \
  "[($ETHEREAL_EID,1,$EXECUTOR_CONFIG),($ETHEREAL_EID,2,$ULN_CONFIG)]" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"

echo ""
echo "=== Configuration Complete ==="
echo "Polygon reader is now configured to send messages to Ethereal"
