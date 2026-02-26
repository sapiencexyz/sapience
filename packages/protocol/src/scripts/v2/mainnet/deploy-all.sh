#!/bin/bash

# V2 Bridge Mainnet Deployment Script
# Deploys and configures the full V2 bridge between Ethereal and Arbitrum mainnets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOCOL_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
DEPLOYMENTS_FILE="$SCRIPT_DIR/deployments.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required env vars
check_env() {
    local missing=0
    for var in "$@"; do
        if [ -z "${!var}" ]; then
            log_error "Missing required env var: $var"
            missing=1
        fi
    done
    return $missing
}

# Validate that a private key derives to the expected address
validate_key_pair() {
    local name=$1
    local address_var=$2
    local key_var=$3

    local expected="${!address_var}"
    local key="${!key_var}"

    if [ -z "$expected" ] || [ -z "$key" ]; then
        log_error "$name: missing $address_var or $key_var"
        return 1
    fi

    local derived
    derived=$(cast wallet address --private-key "$key" 2>/dev/null) || {
        log_error "$name: failed to derive address from $key_var"
        return 1
    }

    # Compare case-insensitively (addresses may differ in checksum)
    if [ "$(echo "$expected" | tr '[:upper:]' '[:lower:]')" != "$(echo "$derived" | tr '[:upper:]' '[:lower:]')" ]; then
        log_error "$name: $key_var derives to $derived but $address_var is $expected"
        return 1
    fi

    log_success "$name: PK matches address $derived"
    return 0
}

# Validate all deployer key pairs and CREATE2 factory requirements
validate_deployers() {
    log_info "=== Validating deployer key pairs ==="

    local failed=0

    validate_key_pair "PM Network" PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_DEPLOYER_PRIVATE_KEY || failed=1
    validate_key_pair "SM Network" SM_NETWORK_DEPLOYER_ADDRESS SM_NETWORK_DEPLOYER_PRIVATE_KEY || failed=1

    # CREATE2 factory requires the same owner on both chains for deterministic addresses
    if [ -n "$PM_NETWORK_DEPLOYER_ADDRESS" ] && [ -n "$SM_NETWORK_DEPLOYER_ADDRESS" ]; then
        local pm_lower=$(echo "$PM_NETWORK_DEPLOYER_ADDRESS" | tr '[:upper:]' '[:lower:]')
        local sm_lower=$(echo "$SM_NETWORK_DEPLOYER_ADDRESS" | tr '[:upper:]' '[:lower:]')
        if [ "$pm_lower" != "$sm_lower" ]; then
            log_warn "PM and SM deployer addresses differ — factory CREATE2 addresses will NOT match across chains"
            log_warn "  PM: $PM_NETWORK_DEPLOYER_ADDRESS"
            log_warn "  SM: $SM_NETWORK_DEPLOYER_ADDRESS"
        else
            log_success "PM and SM deployer addresses match — factory CREATE2 will be deterministic"
        fi
    fi

    if [ $failed -ne 0 ]; then
        log_error "Deployer validation failed"
        exit 1
    fi
}

# Map network-specific deployer vars to generic DEPLOYER_* vars
set_deployer_pm() {
    export DEPLOYER_ADDRESS="$PM_NETWORK_DEPLOYER_ADDRESS"
    export DEPLOYER_PRIVATE_KEY="$PM_NETWORK_DEPLOYER_PRIVATE_KEY"
}

set_deployer_sm() {
    export DEPLOYER_ADDRESS="$SM_NETWORK_DEPLOYER_ADDRESS"
    export DEPLOYER_PRIVATE_KEY="$SM_NETWORK_DEPLOYER_PRIVATE_KEY"
}

# Initialize deployments JSON file if it doesn't exist
init_deployments_json() {
    if [ ! -f "$DEPLOYMENTS_FILE" ]; then
        cat > "$DEPLOYMENTS_FILE" << 'EOF'
{
  "network": "mainnet",
  "pmNetwork": {
    "name": "Ethereal",
    "chainId": 5066318,
    "contracts": {}
  },
  "smNetwork": {
    "name": "Arbitrum One",
    "chainId": 42161,
    "contracts": {}
  },
  "deployedAt": null,
  "lastUpdated": null
}
EOF
        log_info "Created deployments file: $DEPLOYMENTS_FILE"
    fi
}

# Update deployment JSON with a contract address
# Usage: update_deployment <network> <contract_name> <address>
# network: "pmNetwork" or "smNetwork"
update_deployment() {
    local network=$1
    local contract_name=$2
    local address=$3
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Create file if it doesn't exist
    init_deployments_json

    # Update the JSON file using a temp file for atomic write
    local temp_file=$(mktemp)

    # Use jq if available, otherwise fallback to log file
    if command -v jq &> /dev/null; then
        jq --arg net "$network" \
           --arg name "$contract_name" \
           --arg addr "$address" \
           --arg ts "$timestamp" \
           '.[$net].contracts[$name] = $addr | .lastUpdated = $ts | if .deployedAt == null then .deployedAt = $ts else . end' \
           "$DEPLOYMENTS_FILE" > "$temp_file" && mv "$temp_file" "$DEPLOYMENTS_FILE"
    else
        # Fallback: simple log format (jq recommended for proper JSON)
        log_warn "jq not found, using basic file append for deployments"
        echo "$timestamp | $network | $contract_name = $address" >> "${DEPLOYMENTS_FILE%.json}.log"
    fi

    log_info "Saved deployment: $network.$contract_name = $address"
}

# Load .env file
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        log_info "Loaded environment from $ENV_FILE"
    else
        log_error ".env file not found at $ENV_FILE"
        exit 1
    fi
}

# Add or update env variable
update_env() {
    local key=$1
    local value=$2

    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        # Update existing
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
    else
        # Add new
        echo "${key}=${value}" >> "$ENV_FILE"
    fi

    # Export to current shell
    export "$key=$value"
    log_info "Updated $key=$value"
}

# Extract address from forge output
extract_address() {
    local output=$1
    local pattern=$2
    echo "$output" | grep "$pattern" | grep -oE '0x[a-fA-F0-9]{40}' | head -1
}

# Extract bytes32 from forge output
extract_bytes32() {
    local output=$1
    local pattern=$2
    echo "$output" | grep "$pattern" | grep -oE '0x[a-fA-F0-9]{64}' | head -1
}

# Get verifier args for a given RPC URL
get_verifier_args() {
    local rpc_url=$1
    local verify_args=""

    if [[ "$rpc_url" == "$PM_NETWORK_RPC_URL" ]]; then
        # Ethereal uses Blockscout - always use these settings
        verify_args="--verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/"
    elif [[ "$rpc_url" == "$SM_NETWORK_RPC_URL" ]]; then
        # Arbitrum uses Arbiscan (Etherscan-compatible)
        if [[ -n "${SM_NETWORK_ETHERSCAN_API_KEY:-}" ]]; then
            verify_args="--verify --etherscan-api-key $SM_NETWORK_ETHERSCAN_API_KEY"
        fi
    fi

    echo "$verify_args"
}

# Run forge script and capture output (with verification unless SKIP_VERIFY=1)
run_script() {
    local script=$1
    local rpc_url=$2
    local description=$3

    echo ""
    echo "========================================"
    log_info "$description"
    echo "========================================"

    cd "$PROTOCOL_DIR"

    local verify_args=""
    if [[ "${SKIP_VERIFY:-0}" != "1" ]]; then
        verify_args=$(get_verifier_args "$rpc_url")
        if [[ -n "$verify_args" ]]; then
            log_info "Contract verification enabled"
        fi
    else
        log_warn "Contract verification SKIPPED (SKIP_VERIFY=1)"
    fi

    local output
    output=$(forge script "$script" --rpc-url "$rpc_url" --broadcast $verify_args -vvvv 2>&1) || {
        log_error "Script failed: $script"
        echo "$output"
        exit 1
    }

    echo "$output"
    LAST_OUTPUT="$output"
}

# Run forge script without verification (for config scripts)
run_script_no_verify() {
    local script=$1
    local rpc_url=$2
    local description=$3

    echo ""
    echo "========================================"
    log_info "$description"
    echo "========================================"

    cd "$PROTOCOL_DIR"

    local output
    output=$(forge script "$script" --rpc-url "$rpc_url" --broadcast -vvvv 2>&1) || {
        log_error "Script failed: $script"
        echo "$output"
        exit 1
    }

    echo "$output"
    LAST_OUTPUT="$output"
}

# Deploy Test Collateral Token (optional - for testing only)
deploy_test_collateral() {
    log_info "=== Deploy Test Collateral Token (TESTING ONLY) ==="
    log_warn "This deploys a mock ERC20 token - for TESTING PURPOSES ONLY!"

    check_env PM_NETWORK_DEPLOYER_PRIVATE_KEY PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_RPC_URL || exit 1

    run_script "src/scripts/v2/mainnet/00_DeployCollateral.s.sol:DeployCollateral" "$PM_NETWORK_RPC_URL" "Deploying Test Collateral Token on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "COLLATERAL_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "COLLATERAL_TOKEN_ADDRESS" "$addr"
        update_deployment "pmNetwork" "CollateralToken" "$addr"
    fi

    log_success "Test collateral token deployed"
}

# Phase 1: Deploy PM Network Infrastructure
deploy_ethereal_phase1() {
    log_info "=== Phase 1: Deploy PM Network Infrastructure (Mainnet) ==="

    check_env PM_NETWORK_DEPLOYER_PRIVATE_KEY PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_RPC_URL COLLATERAL_TOKEN_ADDRESS || exit 1
    set_deployer_pm

    # 01. Deploy Resolver
    run_script "src/scripts/v2/mainnet/01_DeployResolver.s.sol:DeployResolver" "$PM_NETWORK_RPC_URL" "Deploying ManualConditionResolver on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "RESOLVER_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "RESOLVER_ADDRESS" "$addr"
        update_deployment "pmNetwork" "ManualConditionResolver" "$addr"
    fi

    # 02. Deploy Factory on PM Network (CREATE2 for deterministic address)
    run_script "src/scripts/v2/mainnet/02_DeployFactory.s.sol:DeployFactory" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketTokenFactory on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketTokenFactory" "$addr"
    fi

    # 03. Deploy PredictionMarketV2 (requires FACTORY_ADDRESS)
    run_script "src/scripts/v2/mainnet/03_DeployPredictionMarket.s.sol:DeployPredictionMarket" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketV2 on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PREDICTION_MARKET_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTION_MARKET_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketEscrow" "$addr"
    fi

    # 04. Configure Factory on PM Network (set escrow as deployer)
    run_script_no_verify "src/scripts/v2/mainnet/04_ConfigureFactory.s.sol:ConfigureFactory" "$PM_NETWORK_RPC_URL" "Configuring PM Network Factory (set escrow as deployer)"

    # 05. Deploy PM Network Bridge (requires FACTORY_ADDRESS)
    run_script "src/scripts/v2/mainnet/05_DeployEtherealBridge.s.sol:DeployEtherealBridge" "$PM_NETWORK_RPC_URL" "Deploying PositionTokenBridge on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PM_NETWORK_BRIDGE_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketBridge" "$addr"
    fi

    # 20. Deploy AccountFactory and configure on Escrow
    run_script "src/scripts/v2/mainnet/20_DeployAccountFactory.s.sol:DeployAccountFactory" "$PM_NETWORK_RPC_URL" "Deploying ZeroDevKernelAccountFactory and configuring on Escrow"
    addr=$(extract_address "$LAST_OUTPUT" "ACCOUNT_FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "ACCOUNT_FACTORY_ADDRESS" "$addr"
        update_deployment "pmNetwork" "ZeroDevKernelAccountFactory" "$addr"
    fi

    log_success "Phase 1 complete: Ethereal infrastructure deployed"
}

# Phase 2: Deploy SM Network Infrastructure
deploy_arbitrum_phase2() {
    log_info "=== Phase 2: Deploy SM Network Infrastructure (Mainnet) ==="

    check_env SM_NETWORK_DEPLOYER_PRIVATE_KEY SM_NETWORK_DEPLOYER_ADDRESS SM_NETWORK_RPC_URL SM_NETWORK_LZ_ENDPOINT || exit 1
    set_deployer_sm

    # 06. Deploy Factory on SM Network (CREATE2 - same address as PM)
    run_script "src/scripts/v2/mainnet/06_DeployFactorySM.s.sol:DeployFactorySM" "$SM_NETWORK_RPC_URL" "Deploying PredictionMarketTokenFactory on SM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
        update_deployment "smNetwork" "PredictionMarketTokenFactory" "$addr"
    fi

    # 07. Deploy SM Network Bridge
    run_script "src/scripts/v2/mainnet/07_DeployRemoteBridge.s.sol:DeployRemoteBridge" "$SM_NETWORK_RPC_URL" "Deploying PredictionMarketBridgeRemote on SM Network"
    addr=$(extract_address "$LAST_OUTPUT" "SM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "SM_NETWORK_BRIDGE_ADDRESS" "$addr"
        update_deployment "smNetwork" "PredictionMarketBridgeRemote" "$addr"
    fi

    log_success "Phase 2 complete: Arbitrum infrastructure deployed"
}

# Phase 3: Configure Bridges (basic config)
configure_bridges_phase3() {
    log_info "=== Phase 3: Configure Bridges (Basic) ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS || exit 1

    # 08. Configure PM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/08_ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge" "$PM_NETWORK_RPC_URL" "Configuring PM Network Bridge"

    # 10. Configure SM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/10_ConfigureRemoteBridge.s.sol:ConfigureRemoteBridge" "$SM_NETWORK_RPC_URL" "Configuring Arbitrum SM Network Bridge"

    log_success "Phase 3 complete: Basic bridge configuration done"
}

# Phase 3b: Configure DVN/Libraries
configure_dvn_phase3b() {
    log_info "=== Phase 3b: Configure DVN and Libraries ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              PM_NETWORK_SEND_LIB PM_NETWORK_RECEIVE_LIB PM_NETWORK_DVN_1 PM_NETWORK_DVN_2 \
              SM_NETWORK_SEND_LIB SM_NETWORK_RECEIVE_LIB SM_NETWORK_DVN_1 SM_NETWORK_DVN_2 SM_NETWORK_EXECUTOR || exit 1

    # 09. Set DVN for PM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/09_SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge" "$PM_NETWORK_RPC_URL" "Setting DVN for PM Network Bridge"

    # 11. Set DVN for SM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/11_SetDVN_RemoteBridge.s.sol:SetDVN_RemoteBridge" "$SM_NETWORK_RPC_URL" "Setting DVN for SM Network Bridge"

    log_success "Phase 3b complete: DVN and libraries configured"
}

# Configure PM Network only
configure_pm_only() {
    log_info "=== Configure PM Network Bridge (Ethereal) ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              PM_NETWORK_SEND_LIB PM_NETWORK_RECEIVE_LIB PM_NETWORK_DVN_1 PM_NETWORK_DVN_2 || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/08_ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge" "$PM_NETWORK_RPC_URL" "Configuring PM Network Bridge"
    run_script_no_verify "src/scripts/v2/mainnet/09_SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge" "$PM_NETWORK_RPC_URL" "Setting DVN for PM Network Bridge"

    log_success "PM Network configuration complete"
}

# Configure SM Network only
configure_sm_only() {
    log_info "=== Configure SM Network Bridge (Arbitrum) ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              SM_NETWORK_SEND_LIB SM_NETWORK_RECEIVE_LIB SM_NETWORK_DVN_1 SM_NETWORK_DVN_2 SM_NETWORK_EXECUTOR || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/10_ConfigureRemoteBridge.s.sol:ConfigureRemoteBridge" "$SM_NETWORK_RPC_URL" "Configuring SM Network Bridge"
    run_script_no_verify "src/scripts/v2/mainnet/11_SetDVN_RemoteBridge.s.sol:SetDVN_RemoteBridge" "$SM_NETWORK_RPC_URL" "Setting DVN for SM Network Bridge"

    log_success "SM Network configuration complete"
}

# Check Status
check_status() {
    log_info "=== Checking Deployment Status ==="

    echo ""
    log_info "PM Network Status:"
    run_script_no_verify "src/scripts/v2/mainnet/12_CheckStatus_PMNetwork.s.sol:CheckStatus_PMNetwork" "$PM_NETWORK_RPC_URL" "Checking PM Network status"

    echo ""
    log_info "SM Network Status:"
    run_script_no_verify "src/scripts/v2/mainnet/13_CheckStatus_SMNetwork.s.sol:CheckStatus_SMNetwork" "$SM_NETWORK_RPC_URL" "Checking SM Network status"
}

# Test: Mint Position Tokens
test_mint() {
    log_info "=== Test: Mint Position Tokens ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_DEPLOYER_PRIVATE_KEY PREDICTION_MARKET_ADDRESS COLLATERAL_TOKEN_ADDRESS RESOLVER_ADDRESS PREDICTOR_PRIVATE_KEY COUNTERPARTY_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/14_MintPositionTokens.s.sol:MintPositionTokens" "$PM_NETWORK_RPC_URL" "Minting position tokens"

    # Extract and save token addresses
    local prediction_id=$(echo "$LAST_OUTPUT" | grep "PREDICTION_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    local predictor_token=$(extract_address "$LAST_OUTPUT" "PREDICTOR_TOKEN_ADDRESS=")
    local counterparty_token=$(extract_address "$LAST_OUTPUT" "COUNTERPARTY_TOKEN_ADDRESS=")
    local pick_config_id=$(echo "$LAST_OUTPUT" | grep "PICK_CONFIG_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    local condition_id=$(echo "$LAST_OUTPUT" | grep "CONDITION_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

    [ -n "$prediction_id" ] && update_env "PREDICTION_ID" "$prediction_id"
    if [ -n "$predictor_token" ]; then
        update_env "PREDICTOR_TOKEN_ADDRESS" "$predictor_token"
        update_deployment "pmNetwork" "PredictorToken" "$predictor_token"
    fi
    if [ -n "$counterparty_token" ]; then
        update_env "COUNTERPARTY_TOKEN_ADDRESS" "$counterparty_token"
        update_deployment "pmNetwork" "CounterpartyToken" "$counterparty_token"
    fi
    [ -n "$pick_config_id" ] && update_env "PICK_CONFIG_ID" "$pick_config_id"
    [ -n "$condition_id" ] && update_env "CONDITION_ID" "$condition_id"

    log_success "Position tokens minted"
}

# Test: Bridge to Remote (Ethereal -> Arbitrum)
test_bridge_to_remote() {
    log_info "=== Test: Bridge to Remote (Ethereal -> Arbitrum) ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_BRIDGE_ADDRESS PREDICTOR_TOKEN_ADDRESS PREDICTOR_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/15_TestBridgeToRemote.s.sol:TestBridgeToRemote" "$PM_NETWORK_RPC_URL" "Bridging tokens to Arbitrum"

    # Extract and save BRIDGE_ID
    local bridge_id=$(echo "$LAST_OUTPUT" | grep "BRIDGE_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    [ -n "$bridge_id" ] && update_env "BRIDGE_ID" "$bridge_id"

    log_success "Bridge initiated - check https://layerzeroscan.com/ for status"
}

# Test: Resolve Prediction
test_resolve() {
    log_info "=== Test: Resolve Prediction ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_DEPLOYER_PRIVATE_KEY RESOLVER_ADDRESS CONDITION_ID || exit 1

    local outcome="${OUTCOME:-yes}"
    log_info "Resolving with outcome: $outcome"

    run_script_no_verify "src/scripts/v2/mainnet/16_ResolvePrediction.s.sol:ResolvePrediction" "$PM_NETWORK_RPC_URL" "Resolving prediction (outcome: $outcome)"

    log_success "Prediction resolved"
}

# Test: Bridge Back (Arbitrum -> Ethereal)
test_bridge_back() {
    log_info "=== Test: Bridge Back (Arbitrum -> Ethereal) ==="

    check_env SM_NETWORK_RPC_URL SM_NETWORK_BRIDGE_ADDRESS PREDICTOR_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/17_TestBridgeBack.s.sol:TestBridgeBack" "$SM_NETWORK_RPC_URL" "Bridging tokens back to Ethereal"

    # Extract and save BRIDGE_BACK_ID
    local bridge_back_id=$(echo "$LAST_OUTPUT" | grep "BRIDGE_BACK_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    [ -n "$bridge_back_id" ] && update_env "BRIDGE_BACK_ID" "$bridge_back_id"

    log_success "Bridge back initiated - check https://layerzeroscan.com/ for status"
}

# Retry: Bridge from PM Network (Ethereal)
retry_bridge_pm() {
    log_info "=== Retry Bridge from PM Network (Ethereal) ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_BRIDGE_ADDRESS PM_NETWORK_DEPLOYER_PRIVATE_KEY BRIDGE_ID || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/18_RetryBridgePM.s.sol:RetryBridgePM" "$PM_NETWORK_RPC_URL" "Retrying bridge from PM Network"

    log_success "Retry initiated - check https://layerzeroscan.com/ for status"
}

# Retry: Bridge from SM Network (Arbitrum)
retry_bridge_sm() {
    log_info "=== Retry Bridge from SM Network (Arbitrum) ==="

    check_env SM_NETWORK_RPC_URL SM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_DEPLOYER_PRIVATE_KEY BRIDGE_BACK_ID || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/19_RetryBridgeSM.s.sol:RetryBridgeSM" "$SM_NETWORK_RPC_URL" "Retrying bridge from SM Network"

    log_success "Retry initiated - check https://layerzeroscan.com/ for status"
}

# Parse bridge status from cast output
parse_bridge_status() {
    local status_num=$1
    case "$status_num" in
        0) echo "PENDING" ;;
        1) echo "COMPLETED" ;;
        2) echo "REFUNDED" ;;
        *) echo "UNKNOWN($status_num)" ;;
    esac
}

# Check Bridge Status on PM Network (Ethereal)
check_bridge_pm() {
    log_info "=== Check Bridge Status on PM Network (Ethereal) ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_BRIDGE_ADDRESS BRIDGE_ID || exit 1

    echo ""
    log_info "Bridge ID: $BRIDGE_ID"
    log_info "Bridge Contract: $PM_NETWORK_BRIDGE_ADDRESS"
    echo ""

    # Call getPendingBridge
    local result
    result=$(cast call "$PM_NETWORK_BRIDGE_ADDRESS" \
        "getPendingBridge(bytes32)((address,address,address,uint256,uint64,uint64,uint8))" \
        "$BRIDGE_ID" \
        --rpc-url "$PM_NETWORK_RPC_URL" 2>&1)

    if [[ $? -ne 0 ]]; then
        log_error "Failed to query bridge status"
        echo "$result"
        return 1
    fi

    # Parse the tuple output
    # Format: (token, sender, recipient, amount, createdAt, lastRetryAt, status)
    local token=$(echo "$result" | sed -n 's/.*(\(0x[a-fA-F0-9]*\),.*/\1/p')
    local sender=$(echo "$result" | cut -d',' -f2 | grep -oE '0x[a-fA-F0-9]{40}')
    local recipient=$(echo "$result" | cut -d',' -f3 | grep -oE '0x[a-fA-F0-9]{40}')
    local amount=$(echo "$result" | grep -oE '[0-9]+' | sed -n '1p')
    local status_num=$(echo "$result" | grep -oE '[0-9]+' | tail -1)

    local status_text=$(parse_bridge_status "$status_num")

    echo "========================================"
    echo "  Bridge Status (PM Network)"
    echo "========================================"
    echo "Token:      $token"
    echo "Sender:     $sender"
    echo "Recipient:  $recipient"
    echo "Amount:     $amount"
    echo "Status:     $status_text"
    echo "========================================"

    if [[ "$status_text" == "PENDING" ]]; then
        log_warn "Bridge is PENDING - waiting for LayerZero delivery or needs retry"
    elif [[ "$status_text" == "COMPLETED" ]]; then
        log_success "Bridge is COMPLETED"
    fi
}

# Check Bridge Back Status on SM Network (Arbitrum)
check_bridge_sm() {
    log_info "=== Check Bridge Back Status on SM Network (Arbitrum) ==="

    check_env SM_NETWORK_RPC_URL SM_NETWORK_BRIDGE_ADDRESS BRIDGE_BACK_ID || exit 1

    echo ""
    log_info "Bridge Back ID: $BRIDGE_BACK_ID"
    log_info "Bridge Contract: $SM_NETWORK_BRIDGE_ADDRESS"
    echo ""

    # Call getPendingBridge
    local result
    result=$(cast call "$SM_NETWORK_BRIDGE_ADDRESS" \
        "getPendingBridge(bytes32)((address,address,address,uint256,uint64,uint64,uint8))" \
        "$BRIDGE_BACK_ID" \
        --rpc-url "$SM_NETWORK_RPC_URL" 2>&1)

    if [[ $? -ne 0 ]]; then
        log_error "Failed to query bridge status"
        echo "$result"
        return 1
    fi

    # Parse the tuple output
    local token=$(echo "$result" | sed -n 's/.*(\(0x[a-fA-F0-9]*\),.*/\1/p')
    local sender=$(echo "$result" | cut -d',' -f2 | grep -oE '0x[a-fA-F0-9]{40}')
    local recipient=$(echo "$result" | cut -d',' -f3 | grep -oE '0x[a-fA-F0-9]{40}')
    local amount=$(echo "$result" | grep -oE '[0-9]+' | sed -n '1p')
    local status_num=$(echo "$result" | grep -oE '[0-9]+' | tail -1)

    local status_text=$(parse_bridge_status "$status_num")

    echo "========================================"
    echo "  Bridge Back Status (SM Network)"
    echo "========================================"
    echo "Token:      $token"
    echo "Sender:     $sender"
    echo "Recipient:  $recipient"
    echo "Amount:     $amount"
    echo "Status:     $status_text"
    echo "========================================"

    if [[ "$status_text" == "PENDING" ]]; then
        log_warn "Bridge back is PENDING - waiting for LayerZero delivery or needs retry"
    elif [[ "$status_text" == "COMPLETED" ]]; then
        log_success "Bridge back is COMPLETED"
    fi
}

# Verify contract on explorer
verify_contract() {
    local address=$1
    local contract_path=$2
    local rpc_url=$3
    local description=$4

    log_info "Verifying: $description at $address"

    cd "$PROTOCOL_DIR"

    local verify_cmd=""
    if [[ "$rpc_url" == "$PM_NETWORK_RPC_URL" ]]; then
        # Ethereal uses Blockscout
        verify_cmd="forge verify-contract $address $contract_path --chain-id 5066318 --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/"
    elif [[ "$rpc_url" == "$SM_NETWORK_RPC_URL" ]]; then
        # Arbitrum uses Arbiscan
        if [[ -z "${SM_NETWORK_ETHERSCAN_API_KEY:-}" ]]; then
            log_warn "SM_NETWORK_ETHERSCAN_API_KEY not set, skipping $description"
            return 0
        fi
        verify_cmd="forge verify-contract $address $contract_path --chain-id 42161 --etherscan-api-key $SM_NETWORK_ETHERSCAN_API_KEY"
    fi

    if [[ -n "$verify_cmd" ]]; then
        eval "$verify_cmd" && log_success "Verified: $description" || log_warn "Verification failed for $description (may already be verified)"
    fi
}

# Verify PM Network contracts (Ethereal)
verify_pm() {
    log_info "=== Verify PM Network Contracts (Ethereal) ==="

    check_env PM_NETWORK_RPC_URL || exit 1

    # Verify Bridge if deployed
    if [[ -n "${PM_NETWORK_BRIDGE_ADDRESS:-}" ]]; then
        verify_contract "$PM_NETWORK_BRIDGE_ADDRESS" "src/v2/bridge/PredictionMarketBridge.sol:PredictionMarketBridge" "$PM_NETWORK_RPC_URL" "PredictionMarketBridge"
    fi

    # Verify Resolver if deployed
    if [[ -n "${RESOLVER_ADDRESS:-}" ]]; then
        verify_contract "$RESOLVER_ADDRESS" "src/v2/resolvers/mocks/ManualConditionResolver.sol:ManualConditionResolver" "$PM_NETWORK_RPC_URL" "ManualConditionResolver"
    fi

    # Verify PredictionMarketV2 if deployed
    if [[ -n "${PREDICTION_MARKET_ADDRESS:-}" ]]; then
        verify_contract "$PREDICTION_MARKET_ADDRESS" "src/v2/PredictionMarketEscrow.sol:PredictionMarketEscrow" "$PM_NETWORK_RPC_URL" "PredictionMarketEscrow"
    fi

    # Verify Collateral if it was deployed via script (test token)
    if [[ -n "${COLLATERAL_TOKEN_ADDRESS:-}" ]]; then
        verify_contract "$COLLATERAL_TOKEN_ADDRESS" "test/v2/mocks/MockERC20.sol:MockERC20" "$PM_NETWORK_RPC_URL" "MockERC20 (test collateral)"
    fi

    # Verify Factory if deployed
    if [[ -n "${FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$FACTORY_ADDRESS" "src/v2/PredictionMarketTokenFactory.sol:PredictionMarketTokenFactory" "$PM_NETWORK_RPC_URL" "PredictionMarketTokenFactory"
    fi

    # Verify AccountFactory if deployed
    if [[ -n "${ACCOUNT_FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$ACCOUNT_FACTORY_ADDRESS" "src/v2/utils/ZeroDevKernelAccountFactory.sol:ZeroDevKernelAccountFactory" "$PM_NETWORK_RPC_URL" "ZeroDevKernelAccountFactory"
    fi

    log_success "PM Network verification complete"
}

# Verify SM Network contracts (Arbitrum)
verify_sm() {
    log_info "=== Verify SM Network Contracts (Arbitrum) ==="

    check_env SM_NETWORK_RPC_URL || exit 1

    if [[ -z "${SM_NETWORK_ETHERSCAN_API_KEY:-}" ]]; then
        log_error "SM_NETWORK_ETHERSCAN_API_KEY required for Arbitrum verification"
        exit 1
    fi

    # Verify Factory if deployed
    if [[ -n "${FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$FACTORY_ADDRESS" "src/v2/PredictionMarketTokenFactory.sol:PredictionMarketTokenFactory" "$SM_NETWORK_RPC_URL" "PredictionMarketTokenFactory"
    fi

    # Verify Remote Bridge if deployed
    if [[ -n "${SM_NETWORK_BRIDGE_ADDRESS:-}" ]]; then
        verify_contract "$SM_NETWORK_BRIDGE_ADDRESS" "src/v2/bridge/PredictionMarketBridgeRemote.sol:PredictionMarketBridgeRemote" "$SM_NETWORK_RPC_URL" "PredictionMarketBridgeRemote"
    fi

    log_success "SM Network verification complete"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Deployment Commands:"
    echo "  all                   Run full deployment (phases 1-3b)"
    echo "  all-with-collateral   Run full deployment with test collateral (for testing)"
    echo "  collateral            Deploy test collateral token (optional, for testing)"
    echo "  phase1, deploy-pm     Deploy Ethereal infrastructure"
    echo "  phase2, deploy-sm     Deploy Arbitrum infrastructure"
    echo "  phase3                Configure bridges (basic: peer, config)"
    echo "  phase3b               Configure DVN and libraries"
    echo "  configure-pm          Configure PM Network bridge only"
    echo "  configure-sm          Configure SM Network bridge only"
    echo "  status                Check deployment status"
    echo ""
    echo "Verification Commands:"
    echo "  verify-pm             Verify contracts on PM Network (Ethereal/Blockscout)"
    echo "  verify-sm             Verify contracts on SM Network (Arbitrum/Arbiscan)"
    echo ""
    echo "Test Commands:"
    echo "  mint                  Mint position tokens for testing"
    echo "  bridge-to             Bridge tokens from Ethereal to Arbitrum"
    echo "  resolve               Resolve prediction (set OUTCOME=yes|no|tie)"
    echo "  bridge-back           Bridge tokens back from Arbitrum to Ethereal"
    echo ""
    echo "Retry Commands:"
    echo "  retry-pm              Retry a pending bridge from PM Network (uses BRIDGE_ID)"
    echo "  retry-sm              Retry a pending bridge from SM Network (uses BRIDGE_BACK_ID)"
    echo ""
    echo "Status Commands:"
    echo "  check-bridge          Check BRIDGE_ID status on PM Network (Ethereal)"
    echo "  check-bridge-back     Check BRIDGE_BACK_ID status on SM Network (Arbitrum)"
    echo ""
    echo "Examples:"
    echo "  $0 all                       # Full deployment with verification"
    echo "  SKIP_VERIFY=1 $0 all         # Full deployment WITHOUT verification"
    echo "  $0 verify-pm                 # Verify Ethereal contracts later"
    echo "  $0 verify-sm                 # Verify Arbitrum contracts later"
    echo "  $0 all-with-collateral       # Full deployment with test collateral"
    echo "  $0 phase3b                   # Just configure DVN/libraries"
    echo "  $0 status                    # Check current status"
    echo "  $0 mint                      # Mint position tokens"
    echo "  $0 bridge-to                 # Bridge to Arbitrum"
    echo "  OUTCOME=yes $0 resolve       # Resolve prediction (predictor wins)"
    echo "  $0 bridge-back               # Bridge back to Ethereal"
    echo "  BRIDGE_ID=0x... $0 retry-pm       # Retry bridge from Ethereal"
    echo "  BRIDGE_BACK_ID=0x... $0 retry-sm  # Retry bridge-back from Arbitrum"
    echo "  $0 check-bridge                   # Check bridge status on PM Network"
    echo "  $0 check-bridge-back              # Check bridge-back status on SM Network"
    echo ""
    echo "Required env vars for DVN config (2 DVNs for production):"
    echo "  PM_NETWORK_SEND_LIB, PM_NETWORK_RECEIVE_LIB, PM_NETWORK_DVN_1, PM_NETWORK_DVN_2"
    echo "  SM_NETWORK_SEND_LIB, SM_NETWORK_RECEIVE_LIB, SM_NETWORK_DVN_1, SM_NETWORK_DVN_2, SM_NETWORK_EXECUTOR"
    echo ""
    echo "Required env vars for testing:"
    echo "  PREDICTOR_PRIVATE_KEY, COUNTERPARTY_PRIVATE_KEY"
    echo ""
    echo "Optional env vars:"
    echo "  SKIP_VERIFY=1 (skip contract verification during deployment)"
    echo "  FACTORY_SALT (override default factory CREATE2 salt)"
    echo "  COLLATERAL_NAME, COLLATERAL_SYMBOL, COLLATERAL_INITIAL_SUPPLY (for test collateral)"
    echo "  PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL, BRIDGE_AMOUNT (for testing)"
    echo "  OUTCOME (yes|no|tie for resolve)"
    echo "  BRIDGE_ID (for retry-pm command)"
    echo "  BRIDGE_BACK_ID (for retry-sm command)"
    echo ""
    echo "IMPORTANT: This is a MAINNET deployment script. Double-check all addresses!"
}

# Main
main() {
    echo "========================================"
    echo "  V2 Bridge Mainnet Deployment Script"
    echo "========================================"
    echo ""
    log_warn "MAINNET DEPLOYMENT - Proceed with caution!"
    echo ""

    load_env
    validate_deployers

    # Clean and rebuild to avoid cache issues
    log_info "Cleaning and rebuilding contracts..."
    cd "$PROTOCOL_DIR"
    forge clean && forge build --quiet || {
        log_error "Build failed"
        exit 1
    }
    log_success "Build complete"

    case "${1:-all}" in
        all)
            deploy_ethereal_phase1
            deploy_arbitrum_phase2
            configure_bridges_phase3
            configure_dvn_phase3b
            check_status
            ;;
        all-with-collateral)
            deploy_test_collateral
            deploy_ethereal_phase1
            deploy_arbitrum_phase2
            configure_bridges_phase3
            configure_dvn_phase3b
            check_status
            ;;
        collateral)
            deploy_test_collateral
            ;;
        phase1)
            deploy_ethereal_phase1
            ;;
        phase2)
            deploy_arbitrum_phase2
            ;;
        phase3)
            configure_bridges_phase3
            ;;
        phase3b)
            configure_dvn_phase3b
            ;;
        deploy-pm)
            deploy_ethereal_phase1
            ;;
        deploy-sm)
            deploy_arbitrum_phase2
            ;;
        configure-pm)
            configure_pm_only
            ;;
        configure-sm)
            configure_sm_only
            ;;
        status)
            check_status
            ;;
        verify-pm)
            verify_pm
            ;;
        verify-sm)
            verify_sm
            ;;
        mint)
            test_mint
            ;;
        bridge-to)
            test_bridge_to_remote
            ;;
        resolve)
            test_resolve
            ;;
        bridge-back)
            test_bridge_back
            ;;
        retry-pm)
            retry_bridge_pm
            ;;
        retry-sm)
            retry_bridge_sm
            ;;
        check-bridge)
            check_bridge_pm
            ;;
        check-bridge-back)
            check_bridge_sm
            ;;
        help|--help|-h)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac

    echo ""
    log_success "Done!"
    echo ""
    echo "Monitor cross-chain messages: https://layerzeroscan.com/"
}

main "$@"
