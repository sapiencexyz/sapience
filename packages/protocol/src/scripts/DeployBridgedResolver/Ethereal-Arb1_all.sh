#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
#   ETHEREAL_PRIVATE_KEY        - EOA private key for broadcasting
#   ARB_PRIVATE_KEY        - EOA private key for broadcasting
#   ETHEREAL_RPC       - RPC URL for Ethereal chain
#   ARB_RPC            - RPC URL for Arbitrum One
#   UMA_SIDE_EID       - Arbitrum One LayerZero EID (e.g., 30110)
#   PM_SIDE_EID        - Ethereal LayerZero EID

# Resolve directories relative to script location and protocol root
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
SCRIPTS_DIR="$SCRIPT_PATH"
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)
BROADCAST_DIR="$PROTOCOL_DIR/broadcast"

# Load .env files from packages/protocol before validating env
ENV_DIR="$PROTOCOL_DIR"
if [[ -f "$ENV_DIR/.env.deployments" ]]; then
  echo "Loading environment from $ENV_DIR/.env*"
  set -a
  [[ -f "$ENV_DIR/.env.deployments" ]] && source "$ENV_DIR/.env.deployments"
  set +a
fi

missing()
{
  [[ -z "${ETHEREAL_PRIVATE_KEY:-}" \
  || -z "${ARB_PRIVATE_KEY:-}" \
  || -z "${ETHEREAL_RPC:-}" \
  || -z "${ARB_RPC:-}" \
  || -z "${UMA_SIDE_EID:-}" \
  || -z "${PM_SIDE_EID:-}" \
  || -z "${ETHEREAL_LZ_ENDPOINT:-}" \
  || -z "${ARB_LZ_ENDPOINT:-}" \
  || -z "${ETHEREAL_OWNER:-}" \
  || -z "${ARB_OWNER:-}" \
  || -z "${ETHEREAL_SEND_LIB:-}" \
  || -z "${ETHEREAL_RECEIVE_LIB:-}" \
  || -z "${ETHEREAL_DVN:-}" \
  || -z "${ARB_SEND_LIB:-}" \
  || -z "${ARB_RECEIVE_LIB:-}" \
  || -z "${ARB_DVN:-}" \
  || -z "${ARB_EXECUTOR:-}" ]]
}

if missing; then
  cat >&2 <<'USAGE'
Required environment variables are not set. Please export the following and re-run:

export ETHEREAL_PRIVATE_KEY=0x...
export ARB_PRIVATE_KEY=0x...
export ETHEREAL_RPC=https://etherealchain.rpc.url
export ARB_RPC=https://arb1.arbitrum.io/rpc
export UMA_SIDE_EID=30110           # Arbitrum One eid
export PM_SIDE_EID=<ethereal_eid>   # Ethereal eid
# Deploy-time addresses
export ETHEREAL_LZ_ENDPOINT=0x...
export ARB_LZ_ENDPOINT=0x...
export ETHEREAL_OWNER=0x...
export ARB_OWNER=0x...
# LayerZero library and DVN configuration
export ETHEREAL_SEND_LIB=0x...
export ETHEREAL_RECEIVE_LIB=0x...
export ETHEREAL_DVN=0x...
export ARB_SEND_LIB=0x...
export ARB_RECEIVE_LIB=0x...
export ARB_DVN=0x...
export ARB_EXECUTOR=0x...
# Optional UMA params:
# export UMA_OOV3=0x...
# export UMA_BOND_TOKEN=0x...
# export UMA_BOND_AMOUNT=1000000000000000000
# export UMA_ASSERTION_LIVENESS=3600
# export UMA_ASSERTER=0x...
# Optional LayerZero config params (defaults used if not set):
# export GRACE_PERIOD=0
# export ULN_CONFIRMATIONS=20
# export REQUIRED_DVN_COUNT=1
# export MAX_MESSAGE_SIZE=10000

# Run from packages/protocol:
bash src/scripts/DeployBridgedResolver/Ethereal-Arb1_all.sh
USAGE
  exit 1
fi

# Script can now be run from any directory - paths are resolved dynamically

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}

need jq

echo "[1/6] Deploy PM LZ Resolver on Ethereal"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_deployPredictionMarketLZResolver.s.sol \
  --rpc-url "$ETHEREAL_RPC" \
  --broadcast \
  --private-key "$ETHEREAL_PRIVATE_KEY" )

# Extract PM resolver address from broadcast JSON
PM_RUN_JSON=$(ls -td "$BROADCAST_DIR"/Ethereal-Arb1_deployPredictionMarketLZResolver.s.sol/*/run-latest.json 2>/dev/null | head -n1)
export PM_LZ_RESOLVER=$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$PM_RUN_JSON" | head -n1)
if [[ -z "$PM_LZ_RESOLVER" || "$PM_LZ_RESOLVER" == "null" ]]; then
  echo "Failed to extract PM_LZ_RESOLVER from $PM_RUN_JSON" >&2
  exit 1
fi
echo "PM_LZ_RESOLVER=$PM_LZ_RESOLVER"

echo "[2/6] Deploy UMA-side Resolver on Arbitrum"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_deployPredictionMarketLZResolverUmaSide.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --private-key "$ARB_PRIVATE_KEY" )

# Extract UMA-side resolver address from broadcast JSON
UMA_RUN_JSON=$(ls -td "$BROADCAST_DIR"/Ethereal-Arb1_deployPredictionMarketLZResolverUmaSide.s.sol/*/run-latest.json 2>/dev/null | head -n1)
export UMA_SIDE_RESOLVER=$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$UMA_RUN_JSON" | head -n1)
if [[ -z "$UMA_SIDE_RESOLVER" || "$UMA_SIDE_RESOLVER" == "null" ]]; then
  echo "Failed to extract UMA_SIDE_RESOLVER from $UMA_RUN_JSON" >&2
  exit 1
fi
echo "UMA_SIDE_RESOLVER=$UMA_SIDE_RESOLVER"

# EIDs are required and already validated above

echo "[3/6] Configure PM LZ Resolver on Ethereal"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_configurePredictionMarketLZResolver.s.sol \
  --rpc-url "$ETHEREAL_RPC" \
  --private-key "$ETHEREAL_PRIVATE_KEY" \
  --broadcast)

echo "[4/6] Configure UMA-side Resolver on Arbitrum"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_configurePredictionMarketLZResolverUmaSide.s.sol \
  --rpc-url "$ARB_RPC" \
  --private-key "$ARB_PRIVATE_KEY" \
  --broadcast)

echo "[5/6] Set DVN for PM LZ Resolver on Ethereal"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_setDVN_PredictionMarketLZResolverPMSide.s.sol \
  --rpc-url "$ETHEREAL_RPC" \
  --private-key "$ETHEREAL_PRIVATE_KEY" \
  --broadcast)

echo "[6/6] Set DVN for UMA-side Resolver on Arbitrum"
(cd "$SCRIPTS_DIR" && forge script \
  Ethereal-Arb1_setDVN_PredictionMarketLZResolverUmaSide.s.sol \
  --rpc-url "$ARB_RPC" \
  --private-key "$ARB_PRIVATE_KEY" \
  --broadcast)

echo "Done."


