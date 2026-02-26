#!/bin/bash

# V2 Bridge Deployment Script
# Deploys and configures the full V2 bridge between Ethereal and Arbitrum testnets

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
        local pm_name="${PM_NETWORK_NAME:-PM Network}"
        local sm_name="${SM_NETWORK_NAME:-SM Network}"
        cat > "$DEPLOYMENTS_FILE" << EOF
{
  "network": "testnet",
  "pmNetwork": {
    "name": "${pm_name}",
    "chainId": null,
    "contracts": {}
  },
  "smNetwork": {
    "name": "${sm_name}",
    "chainId": null,
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

    # Use node/jq if available, otherwise use sed
    if command -v jq &> /dev/null; then
        jq --arg net "$network" \
           --arg name "$contract_name" \
           --arg addr "$address" \
           --arg ts "$timestamp" \
           '.[$net].contracts[$name] = $addr | .lastUpdated = $ts | if .deployedAt == null then .deployedAt = $ts else . end' \
           "$DEPLOYMENTS_FILE" > "$temp_file" && mv "$temp_file" "$DEPLOYMENTS_FILE"
    else
        # Fallback: simple sed-based update (less robust but works without jq)
        # For proper JSON handling, jq is recommended
        log_warn "jq not found, using basic file append for deployments"
        # Just log to a simple format
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
# Forge auto-detects verifier URL based on chain ID for known chains
get_verifier_args() {
    local rpc_url=$1
    local verify_args=""

    # Check if this is PM Network or SM Network based on RPC URL
    if [[ "$rpc_url" == "$PM_NETWORK_RPC_URL" ]]; then
        if [[ -n "${PM_NETWORK_ETHERSCAN_API_KEY:-}" ]]; then
            verify_args="--verify --etherscan-api-key $PM_NETWORK_ETHERSCAN_API_KEY"
            # Add custom verifier URL only if specified
            if [[ -n "${PM_NETWORK_VERIFIER_URL:-}" ]]; then
                verify_args="$verify_args --verifier-url $PM_NETWORK_VERIFIER_URL"
            fi
        fi
    elif [[ "$rpc_url" == "$SM_NETWORK_RPC_URL" ]]; then
        if [[ -n "${SM_NETWORK_ETHERSCAN_API_KEY:-}" ]]; then
            verify_args="--verify --etherscan-api-key $SM_NETWORK_ETHERSCAN_API_KEY"
            # Add custom verifier URL only if specified
            if [[ -n "${SM_NETWORK_VERIFIER_URL:-}" ]]; then
                verify_args="$verify_args --verifier-url $SM_NETWORK_VERIFIER_URL"
            fi
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

# Run forge script without verification (for config/test scripts)
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

    check_env PM_NETWORK_DEPLOYER_PRIVATE_KEY PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_RPC_URL || exit 1

    run_script "src/scripts/v2/testnet/01_DeployCollateral.s.sol:DeployCollateral" "$PM_NETWORK_RPC_URL" "Deploying Test Collateral Token on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "COLLATERAL_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "COLLATERAL_TOKEN_ADDRESS" "$addr"
        update_deployment "pmNetwork" "CollateralToken" "$addr"
    fi

    log_success "Test collateral token deployed"
}

# Phase 1: Deploy PM Network Infrastructure
deploy_ethereal_phase1() {
    log_info "=== Phase 1: Deploy PM Network Infrastructure ==="

    check_env PM_NETWORK_DEPLOYER_PRIVATE_KEY PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_RPC_URL COLLATERAL_TOKEN_ADDRESS || exit 1
    set_deployer_pm

    # 02. Deploy Resolver
    run_script "src/scripts/v2/testnet/02_DeployResolver.s.sol:DeployResolver" "$PM_NETWORK_RPC_URL" "Deploying ManualConditionResolver on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "RESOLVER_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "RESOLVER_ADDRESS" "$addr"
        update_deployment "pmNetwork" "ManualConditionResolver" "$addr"
    fi

    # 03. Deploy Factory on PM Network (CREATE2 for deterministic address)
    run_script "src/scripts/v2/testnet/03_DeployFactory.s.sol:DeployFactory" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketTokenFactory on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketTokenFactory" "$addr"
    fi

    # 04. Deploy PredictionMarketV2 (requires FACTORY_ADDRESS)
    run_script "src/scripts/v2/testnet/04_DeployPredictionMarket.s.sol:DeployPredictionMarket" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketV2 on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PREDICTION_MARKET_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTION_MARKET_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketEscrow" "$addr"
    fi

    # 05. Configure Factory on PM Network (set escrow as deployer)
    run_script_no_verify "src/scripts/v2/testnet/05_ConfigureFactory.s.sol:ConfigureFactory" "$PM_NETWORK_RPC_URL" "Configuring PM Network Factory (set escrow as deployer)"

    # 06. Deploy PM Network Bridge (requires FACTORY_ADDRESS)
    run_script "src/scripts/v2/testnet/06_DeployEtherealBridge.s.sol:DeployEtherealBridge" "$PM_NETWORK_RPC_URL" "Deploying PositionTokenBridge on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PM_NETWORK_BRIDGE_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictionMarketBridge" "$addr"
    fi

    # 19. Deploy AccountFactory and configure on Escrow (or reuse existing)
    run_script "src/scripts/v2/testnet/19_DeployAccountFactory.s.sol:DeployAccountFactory" "$PM_NETWORK_RPC_URL" "Deploying ZeroDevKernelAccountFactory and configuring on Escrow"
    addr=$(extract_address "$LAST_OUTPUT" "ACCOUNT_FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "ACCOUNT_FACTORY_ADDRESS" "$addr"
        update_deployment "pmNetwork" "ZeroDevKernelAccountFactory" "$addr"
    fi

    log_success "Phase 1 complete: Ethereal infrastructure deployed"
}

# Phase 2: Deploy SM Network Infrastructure
deploy_arbitrum_phase2() {
    log_info "=== Phase 2: Deploy SM Network Infrastructure ==="

    check_env SM_NETWORK_DEPLOYER_PRIVATE_KEY SM_NETWORK_DEPLOYER_ADDRESS SM_NETWORK_RPC_URL SM_NETWORK_LZ_ENDPOINT || exit 1
    set_deployer_sm

    # 07. Deploy Factory on SM Network (CREATE2 - same address as PM)
    run_script "src/scripts/v2/testnet/07_DeployFactorySM.s.sol:DeployFactorySM" "$SM_NETWORK_RPC_URL" "Deploying PredictionMarketTokenFactory on SM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
        update_deployment "smNetwork" "PredictionMarketTokenFactory" "$addr"
    fi

    # 08. Deploy SM Network Bridge
    run_script "src/scripts/v2/testnet/08_DeployRemoteBridge.s.sol:DeployRemoteBridge" "$SM_NETWORK_RPC_URL" "Deploying PredictionMarketBridgeRemote on SM Network"
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

    # 09. Configure PM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/09_ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge" "$PM_NETWORK_RPC_URL" "Configuring PM Network Bridge"

    # 11. Configure SM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/11_ConfigureRemoteBridge.s.sol:ConfigureRemoteBridge" "$SM_NETWORK_RPC_URL" "Configuring Arbitrum SM Network Bridge"

    log_success "Phase 3 complete: Basic bridge configuration done"
}

# Phase 3b: Configure DVN/Libraries
configure_dvn_phase3b() {
    log_info "=== Phase 3b: Configure DVN and Libraries ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              PM_NETWORK_SEND_LIB PM_NETWORK_RECEIVE_LIB PM_NETWORK_DVN \
              SM_NETWORK_SEND_LIB SM_NETWORK_RECEIVE_LIB SM_NETWORK_DVN SM_NETWORK_EXECUTOR || exit 1

    # 10. Set DVN for PM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/10_SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge" "$PM_NETWORK_RPC_URL" "Setting DVN for PM Network Bridge"

    # 12. Set DVN for SM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/12_SetDVN_RemoteBridge.s.sol:SetDVN_RemoteBridge" "$SM_NETWORK_RPC_URL" "Setting DVN for SM Network Bridge"

    log_success "Phase 3b complete: DVN and libraries configured"
}

# Phase 4: Mint Position Tokens
mint_tokens_phase4() {
    log_info "=== Phase 4: Mint Position Tokens ==="

    check_env PREDICTION_MARKET_ADDRESS COLLATERAL_TOKEN_ADDRESS RESOLVER_ADDRESS || exit 1
    set_deployer_pm

    # 13. Mint Position Tokens
    run_script_no_verify "src/scripts/v2/testnet/13_MintPositionTokens.s.sol:MintPredictionMarketTokens" "$PM_NETWORK_RPC_URL" "Minting Position Tokens via PredictionMarketV2"

    local addr=$(extract_address "$LAST_OUTPUT" "PREDICTOR_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTOR_TOKEN_ADDRESS" "$addr"
        update_deployment "pmNetwork" "PredictorToken" "$addr"
    fi

    addr=$(extract_address "$LAST_OUTPUT" "COUNTERPARTY_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "COUNTERPARTY_TOKEN_ADDRESS" "$addr"
        update_deployment "pmNetwork" "CounterpartyToken" "$addr"
    fi

    local bytes32=$(extract_bytes32 "$LAST_OUTPUT" "PICK_CONFIG_ID=")
    if [ -n "$bytes32" ]; then
        update_env "PICK_CONFIG_ID" "$bytes32"
    fi

    bytes32=$(extract_bytes32 "$LAST_OUTPUT" "CONDITION_ID=")
    if [ -n "$bytes32" ]; then
        update_env "CONDITION_ID" "$bytes32"
    fi

    log_success "Phase 4 complete: Position tokens minted"
}

# Phase 5: Test Bridging
test_bridging_phase5() {
    log_info "=== Phase 5: Test Bridging ==="

    check_env PREDICTOR_TOKEN_ADDRESS PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS || exit 1

    # 14. Bridge to Remote
    run_script_no_verify "src/scripts/v2/testnet/14_TestBridgeToRemote.s.sol:TestBridgeToRemote" "$PM_NETWORK_RPC_URL" "Bridging tokens from PM Network to SM Network"

    log_warn "Waiting 180 seconds for LayerZero delivery..."
    sleep 180

    # 15. Bridge Back
    run_script_no_verify "src/scripts/v2/testnet/15_TestBridgeBack.s.sol:TestBridgeBack" "$SM_NETWORK_RPC_URL" "Bridging tokens back from SM Network to PM Network"

    log_success "Phase 5 complete: Bridge test initiated"
}

# Check Status
check_status() {
    log_info "=== Checking Deployment Status ==="

    echo ""
    log_info "PM Network Status:"
    run_script_no_verify "src/scripts/v2/testnet/17_CheckStatus_PMNetwork.s.sol:CheckStatus_PMNetwork" "$PM_NETWORK_RPC_URL" "Checking PM Network status"

    echo ""
    log_info "SM Network Status:"
    run_script_no_verify "src/scripts/v2/testnet/18_CheckStatus_SMNetwork.s.sol:CheckStatus_SMNetwork" "$SM_NETWORK_RPC_URL" "Checking SM Network status"
}

# Verify contract on explorer
verify_contract() {
    local address=$1
    local contract_path=$2
    local rpc_url=$3
    local verifier=$4
    local verifier_url=$5
    local api_key=$6
    local description=$7

    log_info "Verifying: $description at $address"

    cd "$PROTOCOL_DIR"

    local verify_cmd="forge verify-contract $address $contract_path --rpc-url $rpc_url"

    if [[ "$verifier" == "blockscout" ]]; then
        verify_cmd="$verify_cmd --verifier blockscout --verifier-url $verifier_url"
    elif [[ -n "$api_key" ]]; then
        verify_cmd="$verify_cmd --etherscan-api-key $api_key"
        if [[ -n "$verifier_url" ]]; then
            verify_cmd="$verify_cmd --verifier-url $verifier_url"
        fi
    else
        log_warn "No API key provided for $description, skipping"
        return 0
    fi

    eval "$verify_cmd" && log_success "Verified: $description" || log_warn "Verification failed for $description (may already be verified)"
}

# Verify PM Network contracts
verify_pm() {
    log_info "=== Verify PM Network Contracts ==="

    check_env PM_NETWORK_RPC_URL || exit 1

    local rpc_url="$PM_NETWORK_RPC_URL"
    local verifier="${PM_NETWORK_VERIFIER:-etherscan}"
    local verifier_url="${PM_NETWORK_VERIFIER_URL:-}"
    local api_key="${PM_NETWORK_ETHERSCAN_API_KEY:-}"

    # Verify Collateral if deployed via script
    if [[ -n "${COLLATERAL_TOKEN_ADDRESS:-}" ]]; then
        verify_contract "$COLLATERAL_TOKEN_ADDRESS" "test/v2/mocks/MockERC20.sol:MockERC20" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "MockERC20 (test collateral)"
    fi

    # Verify Resolver if deployed
    if [[ -n "${RESOLVER_ADDRESS:-}" ]]; then
        verify_contract "$RESOLVER_ADDRESS" "src/v2/resolvers/mocks/ManualConditionResolver.sol:ManualConditionResolver" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "ManualConditionResolver"
    fi

    # Verify PredictionMarketEscrow if deployed
    if [[ -n "${PREDICTION_MARKET_ADDRESS:-}" ]]; then
        verify_contract "$PREDICTION_MARKET_ADDRESS" "src/v2/PredictionMarketEscrow.sol:PredictionMarketEscrow" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "PredictionMarketEscrow"
    fi

    # Verify Bridge if deployed
    if [[ -n "${PM_NETWORK_BRIDGE_ADDRESS:-}" ]]; then
        verify_contract "$PM_NETWORK_BRIDGE_ADDRESS" "src/v2/bridge/PredictionMarketBridge.sol:PredictionMarketBridge" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "PredictionMarketBridge"
    fi

    # Verify Factory if deployed
    if [[ -n "${FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$FACTORY_ADDRESS" "src/v2/PredictionMarketTokenFactory.sol:PredictionMarketTokenFactory" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "PredictionMarketTokenFactory"
    fi

    # Verify AccountFactory if deployed
    if [[ -n "${ACCOUNT_FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$ACCOUNT_FACTORY_ADDRESS" "src/v2/utils/ZeroDevKernelAccountFactory.sol:ZeroDevKernelAccountFactory" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "ZeroDevKernelAccountFactory"
    fi

    log_success "PM Network verification complete"
}

# Verify SM Network contracts
verify_sm() {
    log_info "=== Verify SM Network Contracts ==="

    check_env SM_NETWORK_RPC_URL || exit 1

    local rpc_url="$SM_NETWORK_RPC_URL"
    local verifier="${SM_NETWORK_VERIFIER:-etherscan}"
    local verifier_url="${SM_NETWORK_VERIFIER_URL:-}"
    local api_key="${SM_NETWORK_ETHERSCAN_API_KEY:-}"

    # Verify Factory if deployed
    if [[ -n "${FACTORY_ADDRESS:-}" ]]; then
        verify_contract "$FACTORY_ADDRESS" "src/v2/PredictionMarketTokenFactory.sol:PredictionMarketTokenFactory" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "PredictionMarketTokenFactory"
    fi

    # Verify Remote Bridge if deployed
    if [[ -n "${SM_NETWORK_BRIDGE_ADDRESS:-}" ]]; then
        verify_contract "$SM_NETWORK_BRIDGE_ADDRESS" "src/v2/bridge/PredictionMarketBridgeRemote.sol:PredictionMarketBridgeRemote" \
            "$rpc_url" "$verifier" "$verifier_url" "$api_key" "PredictionMarketBridgeRemote"
    fi

    log_success "SM Network verification complete"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Deployment Commands:"
    echo "  all                   Run full deployment (phases 1-4, including DVN config)"
    echo "  all-with-collateral   Run full deployment with test collateral (for testing)"
    echo "  collateral            Deploy test collateral token (optional, for testing)"
    echo "  deploy                Run deployment only (phases 1-3b)"
    echo "  phase1                Deploy Ethereal infrastructure"
    echo "  phase2                Deploy Arbitrum infrastructure"
    echo "  phase3                Configure bridges (basic: peer, config)"
    echo "  phase3b               Configure DVN and libraries"
    echo "  phase4                Mint position tokens"
    echo "  phase5                Test bridging"
    echo "  test                  Run bridge test (phases 4-5)"
    echo "  status                Check deployment status"
    echo ""
    echo "Verification Commands:"
    echo "  verify-pm             Verify contracts on PM Network"
    echo "  verify-sm             Verify contracts on SM Network"
    echo ""
    echo "Examples:"
    echo "  $0 all                         # Full deployment with DVN config and mint"
    echo "  $0 all-with-collateral         # Full deployment with test collateral"
    echo "  SKIP_VERIFY=1 $0 all           # Full deployment WITHOUT verification"
    echo "  $0 deploy                      # Deploy and configure only (no mint)"
    echo "  $0 phase3b                     # Just configure DVN/libraries"
    echo "  $0 status                      # Check current status"
    echo "  $0 verify-pm                   # Verify PM Network contracts"
    echo "  $0 verify-sm                   # Verify SM Network contracts"
    echo ""
    echo "Required env vars for deployment:"
    echo "  PM_NETWORK_DEPLOYER_ADDRESS, PM_NETWORK_DEPLOYER_PRIVATE_KEY, PM_NETWORK_RPC_URL"
    echo "  SM_NETWORK_DEPLOYER_ADDRESS, SM_NETWORK_DEPLOYER_PRIVATE_KEY, SM_NETWORK_RPC_URL"
    echo "  COLLATERAL_TOKEN_ADDRESS (or deploy with 'collateral' command to create test token)"
    echo ""
    echo "Required env vars for DVN config:"
    echo "  PM_NETWORK_SEND_LIB, PM_NETWORK_RECEIVE_LIB, PM_NETWORK_DVN"
    echo "  SM_NETWORK_SEND_LIB, SM_NETWORK_RECEIVE_LIB, SM_NETWORK_DVN, SM_NETWORK_EXECUTOR"
    echo ""
    echo "Required env vars for verification:"
    echo "  PM_NETWORK_ETHERSCAN_API_KEY (or PM_NETWORK_VERIFIER=blockscout with PM_NETWORK_VERIFIER_URL)"
    echo "  SM_NETWORK_ETHERSCAN_API_KEY"
    echo ""
    echo "Optional env vars:"
    echo "  SKIP_VERIFY=1 (skip contract verification during deployment)"
    echo "  PM_NETWORK_VERIFIER (etherscan or blockscout, default: etherscan)"
    echo "  PM_NETWORK_VERIFIER_URL (custom verifier URL)"
    echo "  PM_ACK_FEE_ESTIMATE (default: 0.0001 ether)"
    echo "  SM_ACK_FEE_ESTIMATE (default: 0.5 ether - Ethereal uses USDe as native token)"
}

# Main
main() {
    echo "========================================"
    echo "  V2 Bridge Deployment Script"
    echo "========================================"

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
            mint_tokens_phase4
            check_status
            ;;
        all-with-collateral)
            deploy_test_collateral
            deploy_ethereal_phase1
            deploy_arbitrum_phase2
            configure_bridges_phase3
            configure_dvn_phase3b
            mint_tokens_phase4
            check_status
            ;;
        collateral)
            deploy_test_collateral
            ;;
        deploy)
            deploy_ethereal_phase1
            deploy_arbitrum_phase2
            configure_bridges_phase3
            configure_dvn_phase3b
            check_status
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
        phase4)
            mint_tokens_phase4
            ;;
        phase5)
            test_bridging_phase5
            ;;
        test)
            mint_tokens_phase4
            test_bridging_phase5
            check_status
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
    echo "Monitor cross-chain messages: https://testnet.layerzeroscan.com/"
}

main "$@"
