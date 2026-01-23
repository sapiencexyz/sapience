#!/bin/bash

# V2 Bridge Mainnet Deployment Script
# Deploys and configures the full V2 bridge between Ethereal and Arbitrum mainnets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOCOL_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ENV_FILE="$PROTOCOL_DIR/.env"

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

# Run forge script and capture output (with verification)
run_script() {
    local script=$1
    local rpc_url=$2
    local description=$3

    echo ""
    echo "========================================"
    log_info "$description"
    echo "========================================"

    cd "$PROTOCOL_DIR"

    local verify_args=$(get_verifier_args "$rpc_url")
    if [[ -n "$verify_args" ]]; then
        log_info "Contract verification enabled"
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
    fi

    log_success "Test collateral token deployed"
}

# Phase 1: Deploy PM Network Infrastructure
deploy_ethereal_phase1() {
    log_info "=== Phase 1: Deploy PM Network Infrastructure (Mainnet) ==="

    check_env PM_NETWORK_DEPLOYER_PRIVATE_KEY PM_NETWORK_DEPLOYER_ADDRESS PM_NETWORK_RPC_URL COLLATERAL_TOKEN_ADDRESS || exit 1

    # 01. Deploy Resolver
    run_script "src/scripts/v2/mainnet/01_DeployResolver.s.sol:DeployResolver" "$PM_NETWORK_RPC_URL" "Deploying ManualConditionResolver on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "RESOLVER_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "RESOLVER_ADDRESS" "$addr"
    fi

    # 02. Deploy PredictionMarketV2
    run_script "src/scripts/v2/mainnet/02_DeployPredictionMarket.s.sol:DeployPredictionMarket" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketV2 on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PREDICTION_MARKET_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTION_MARKET_ADDRESS" "$addr"
    fi

    # 03. Deploy PM Network Bridge
    run_script "src/scripts/v2/mainnet/03_DeployEtherealBridge.s.sol:DeployEtherealBridge" "$PM_NETWORK_RPC_URL" "Deploying PositionTokenBridge on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PM_NETWORK_BRIDGE_ADDRESS" "$addr"
    fi

    log_success "Phase 1 complete: Ethereal infrastructure deployed"
}

# Phase 2: Deploy SM Network Infrastructure
deploy_arbitrum_phase2() {
    log_info "=== Phase 2: Deploy SM Network Infrastructure (Mainnet) ==="

    check_env SM_NETWORK_DEPLOYER_PRIVATE_KEY SM_NETWORK_DEPLOYER_ADDRESS SM_NETWORK_RPC_URL SM_NETWORK_LZ_ENDPOINT || exit 1

    # 04. Deploy Factory
    run_script "src/scripts/v2/mainnet/04_DeployFactory.s.sol:DeployFactory" "$SM_NETWORK_RPC_URL" "Deploying PositionTokenFactory on SM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
    fi

    # 05. Deploy SM Network Bridge
    run_script "src/scripts/v2/mainnet/05_DeployRemoteBridge.s.sol:DeployRemoteBridge" "$SM_NETWORK_RPC_URL" "Deploying PositionTokenBridgeRemote on SM Network"
    addr=$(extract_address "$LAST_OUTPUT" "SM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "SM_NETWORK_BRIDGE_ADDRESS" "$addr"
    fi

    log_success "Phase 2 complete: Arbitrum infrastructure deployed"
}

# Phase 3: Configure Bridges (basic config)
configure_bridges_phase3() {
    log_info "=== Phase 3: Configure Bridges (Basic) ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS || exit 1

    # 06. Configure PM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/06_ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge" "$PM_NETWORK_RPC_URL" "Configuring PM Network Bridge"

    # 07. Configure SM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/07_ConfigureRemoteBridge.s.sol:ConfigureRemoteBridge" "$SM_NETWORK_RPC_URL" "Configuring Arbitrum SM Network Bridge"

    log_success "Phase 3 complete: Basic bridge configuration done"
}

# Phase 3b: Configure DVN/Libraries
configure_dvn_phase3b() {
    log_info "=== Phase 3b: Configure DVN and Libraries ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              PM_NETWORK_SEND_LIB PM_NETWORK_RECEIVE_LIB PM_NETWORK_DVN_1 PM_NETWORK_DVN_2 \
              SM_NETWORK_SEND_LIB SM_NETWORK_RECEIVE_LIB SM_NETWORK_DVN_1 SM_NETWORK_DVN_2 SM_NETWORK_EXECUTOR || exit 1

    # 06b. Set DVN for PM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/06b_SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge" "$PM_NETWORK_RPC_URL" "Setting DVN for PM Network Bridge"

    # 07b. Set DVN for SM Network Bridge
    run_script_no_verify "src/scripts/v2/mainnet/07b_SetDVN_RemoteBridge.s.sol:SetDVN_RemoteBridge" "$SM_NETWORK_RPC_URL" "Setting DVN for SM Network Bridge"

    log_success "Phase 3b complete: DVN and libraries configured"
}

# Check Status
check_status() {
    log_info "=== Checking Deployment Status ==="

    echo ""
    log_info "PM Network Status:"
    run_script_no_verify "src/scripts/v2/mainnet/08a_CheckStatus_PMNetwork.s.sol:CheckStatus_PMNetwork" "$PM_NETWORK_RPC_URL" "Checking PM Network status"

    echo ""
    log_info "SM Network Status:"
    run_script_no_verify "src/scripts/v2/mainnet/08b_CheckStatus_SMNetwork.s.sol:CheckStatus_SMNetwork" "$SM_NETWORK_RPC_URL" "Checking SM Network status"
}

# Test: Mint Position Tokens
test_mint() {
    log_info "=== Test: Mint Position Tokens ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_DEPLOYER_PRIVATE_KEY PREDICTION_MARKET_ADDRESS COLLATERAL_TOKEN_ADDRESS RESOLVER_ADDRESS PREDICTOR_PRIVATE_KEY COUNTERPARTY_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/09_MintPositionTokens.s.sol:MintPositionTokens" "$PM_NETWORK_RPC_URL" "Minting position tokens"

    # Extract and save token addresses
    local prediction_id=$(echo "$LAST_OUTPUT" | grep "PREDICTION_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    local predictor_token=$(extract_address "$LAST_OUTPUT" "PREDICTOR_TOKEN_ADDRESS=")
    local counterparty_token=$(extract_address "$LAST_OUTPUT" "COUNTERPARTY_TOKEN_ADDRESS=")
    local pick_config_id=$(echo "$LAST_OUTPUT" | grep "PICK_CONFIG_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
    local condition_id=$(echo "$LAST_OUTPUT" | grep "CONDITION_ID=" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

    [ -n "$prediction_id" ] && update_env "PREDICTION_ID" "$prediction_id"
    [ -n "$predictor_token" ] && update_env "PREDICTOR_TOKEN_ADDRESS" "$predictor_token"
    [ -n "$counterparty_token" ] && update_env "COUNTERPARTY_TOKEN_ADDRESS" "$counterparty_token"
    [ -n "$pick_config_id" ] && update_env "PICK_CONFIG_ID" "$pick_config_id"
    [ -n "$condition_id" ] && update_env "CONDITION_ID" "$condition_id"

    log_success "Position tokens minted"
}

# Test: Bridge to Remote (Ethereal -> Arbitrum)
test_bridge_to_remote() {
    log_info "=== Test: Bridge to Remote (Ethereal -> Arbitrum) ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_BRIDGE_ADDRESS PREDICTOR_TOKEN_ADDRESS PREDICTOR_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/10_TestBridgeToRemote.s.sol:TestBridgeToRemote" "$PM_NETWORK_RPC_URL" "Bridging tokens to Arbitrum"

    log_success "Bridge initiated - check https://layerzeroscan.com/ for status"
}

# Test: Resolve Prediction
test_resolve() {
    log_info "=== Test: Resolve Prediction ==="

    check_env PM_NETWORK_RPC_URL PM_NETWORK_DEPLOYER_PRIVATE_KEY RESOLVER_ADDRESS CONDITION_ID || exit 1

    local outcome="${OUTCOME:-yes}"
    log_info "Resolving with outcome: $outcome"

    run_script_no_verify "src/scripts/v2/mainnet/10b_ResolvePrediction.s.sol:ResolvePrediction" "$PM_NETWORK_RPC_URL" "Resolving prediction (outcome: $outcome)"

    log_success "Prediction resolved"
}

# Test: Bridge Back (Arbitrum -> Ethereal)
test_bridge_back() {
    log_info "=== Test: Bridge Back (Arbitrum -> Ethereal) ==="

    check_env SM_NETWORK_RPC_URL SM_NETWORK_BRIDGE_ADDRESS PREDICTOR_PRIVATE_KEY || exit 1

    run_script_no_verify "src/scripts/v2/mainnet/11_TestBridgeBack.s.sol:TestBridgeBack" "$SM_NETWORK_RPC_URL" "Bridging tokens back to Ethereal"

    log_success "Bridge back initiated - check https://layerzeroscan.com/ for status"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Deployment Commands:"
    echo "  all                   Run full deployment (phases 1-3b)"
    echo "  all-with-collateral   Run full deployment with test collateral (for testing)"
    echo "  collateral            Deploy test collateral token (optional, for testing)"
    echo "  phase1                Deploy Ethereal infrastructure"
    echo "  phase2                Deploy Arbitrum infrastructure"
    echo "  phase3                Configure bridges (basic: peer, config)"
    echo "  phase3b               Configure DVN and libraries"
    echo "  status                Check deployment status"
    echo ""
    echo "Test Commands:"
    echo "  mint                  Mint position tokens for testing"
    echo "  bridge-to             Bridge tokens from Ethereal to Arbitrum"
    echo "  resolve               Resolve prediction (set OUTCOME=yes|no|tie)"
    echo "  bridge-back           Bridge tokens back from Arbitrum to Ethereal"
    echo ""
    echo "Examples:"
    echo "  $0 all                    # Full deployment with DVN config"
    echo "  $0 all-with-collateral    # Full deployment with test collateral"
    echo "  $0 phase3b                # Just configure DVN/libraries"
    echo "  $0 status                 # Check current status"
    echo "  $0 mint                   # Mint position tokens"
    echo "  $0 bridge-to              # Bridge to Arbitrum"
    echo "  OUTCOME=yes $0 resolve    # Resolve prediction (predictor wins)"
    echo "  $0 bridge-back            # Bridge back to Ethereal"
    echo ""
    echo "Required env vars for DVN config (2 DVNs for production):"
    echo "  PM_NETWORK_SEND_LIB, PM_NETWORK_RECEIVE_LIB, PM_NETWORK_DVN_1, PM_NETWORK_DVN_2"
    echo "  SM_NETWORK_SEND_LIB, SM_NETWORK_RECEIVE_LIB, SM_NETWORK_DVN_1, SM_NETWORK_DVN_2, SM_NETWORK_EXECUTOR"
    echo ""
    echo "Required env vars for testing:"
    echo "  PREDICTOR_PRIVATE_KEY, COUNTERPARTY_PRIVATE_KEY"
    echo ""
    echo "Optional env vars:"
    echo "  COLLATERAL_NAME, COLLATERAL_SYMBOL, COLLATERAL_INITIAL_SUPPLY (for test collateral)"
    echo "  PREDICTOR_WAGER, COUNTERPARTY_WAGER, BRIDGE_AMOUNT (for testing)"
    echo "  OUTCOME (yes|no|tie for resolve)"
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
        status)
            check_status
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
