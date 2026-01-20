#!/bin/bash

# V2 Bridge Deployment Script
# Deploys and configures the full V2 bridge between Ethereal and Arbitrum testnets

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

    # Get verification args if available
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

# Phase 1: Deploy PM Network Infrastructure
deploy_ethereal_phase1() {
    log_info "=== Phase 1: Deploy PM Network Infrastructure ==="

    check_env DEPLOYER_PRIVATE_KEY DEPLOYER_ADDRESS PM_NETWORK_RPC_URL || exit 1

    # 01. Deploy Collateral Token
    run_script "src/scripts/v2/testnet/01_DeployCollateral.s.sol:DeployCollateral" "$PM_NETWORK_RPC_URL" "Deploying Collateral Token on PM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "COLLATERAL_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "COLLATERAL_TOKEN_ADDRESS" "$addr"
    fi

    # 02. Deploy Resolver
    run_script "src/scripts/v2/testnet/02_DeployResolver.s.sol:DeployResolver" "$PM_NETWORK_RPC_URL" "Deploying ManualConditionResolver on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "RESOLVER_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "RESOLVER_ADDRESS" "$addr"
    fi

    # 03. Deploy PredictionMarketV2
    run_script "src/scripts/v2/testnet/03_DeployPredictionMarket.s.sol:DeployPredictionMarket" "$PM_NETWORK_RPC_URL" "Deploying PredictionMarketV2 on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PREDICTION_MARKET_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTION_MARKET_ADDRESS" "$addr"
    fi

    # 05. Deploy PM Network Bridge
    run_script "src/scripts/v2/testnet/05_DeployEtherealBridge.s.sol:DeployEtherealBridge" "$PM_NETWORK_RPC_URL" "Deploying PositionTokenBridge on PM Network"
    addr=$(extract_address "$LAST_OUTPUT" "PM_NETWORK_BRIDGE_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PM_NETWORK_BRIDGE_ADDRESS" "$addr"
    fi

    log_success "Phase 1 complete: Ethereal infrastructure deployed"
}

# Phase 2: Deploy SM Network Infrastructure
deploy_arbitrum_phase2() {
    log_info "=== Phase 2: Deploy SM Network Infrastructure ==="

    check_env SM_NETWORK_RPC_URL SM_NETWORK_LZ_ENDPOINT || exit 1

    # 04. Deploy Factory
    run_script "src/scripts/v2/testnet/04_DeployFactory.s.sol:DeployFactory" "$SM_NETWORK_RPC_URL" "Deploying PositionTokenFactory on SM Network"
    local addr=$(extract_address "$LAST_OUTPUT" "FACTORY_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "FACTORY_ADDRESS" "$addr"
    fi

    # 06. Deploy SM Network Bridge
    run_script "src/scripts/v2/testnet/06_DeployRemoteBridge.s.sol:DeployRemoteBridge" "$SM_NETWORK_RPC_URL" "Deploying PositionTokenBridgeRemote on SM Network"
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

    # 07. Configure PM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/07_ConfigureEtherealBridge.s.sol:ConfigureEtherealBridge" "$PM_NETWORK_RPC_URL" "Configuring PM Network Bridge"

    # 08. Configure SM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/08_ConfigureRemoteBridge.s.sol:ConfigureRemoteBridge" "$SM_NETWORK_RPC_URL" "Configuring Arbitrum SM Network Bridge"

    log_success "Phase 3 complete: Basic bridge configuration done"
}

# Phase 3b: Configure DVN/Libraries
configure_dvn_phase3b() {
    log_info "=== Phase 3b: Configure DVN and Libraries ==="

    check_env PM_NETWORK_BRIDGE_ADDRESS SM_NETWORK_BRIDGE_ADDRESS \
              PM_NETWORK_SEND_LIB PM_NETWORK_RECEIVE_LIB PM_NETWORK_DVN \
              SM_NETWORK_SEND_LIB SM_NETWORK_RECEIVE_LIB SM_NETWORK_DVN SM_NETWORK_EXECUTOR || exit 1

    # 07b. Set DVN for PM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/07b_SetDVN_EtherealBridge.s.sol:SetDVN_EtherealBridge" "$PM_NETWORK_RPC_URL" "Setting DVN for PM Network Bridge"

    # 08b. Set DVN for SM Network Bridge
    run_script_no_verify "src/scripts/v2/testnet/08b_SetDVN_RemoteBridge.s.sol:SetDVN_RemoteBridge" "$SM_NETWORK_RPC_URL" "Setting DVN for SM Network Bridge"

    log_success "Phase 3b complete: DVN and libraries configured"
}

# Phase 4: Mint Position Tokens
mint_tokens_phase4() {
    log_info "=== Phase 4: Mint Position Tokens ==="

    check_env PREDICTION_MARKET_ADDRESS COLLATERAL_TOKEN_ADDRESS RESOLVER_ADDRESS || exit 1

    # 09. Mint Position Tokens
    run_script_no_verify "src/scripts/v2/testnet/09_MintPositionTokens.s.sol:MintPositionTokens" "$PM_NETWORK_RPC_URL" "Minting Position Tokens via PredictionMarketV2"

    local addr=$(extract_address "$LAST_OUTPUT" "PREDICTOR_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "PREDICTOR_TOKEN_ADDRESS" "$addr"
    fi

    addr=$(extract_address "$LAST_OUTPUT" "COUNTERPARTY_TOKEN_ADDRESS=")
    if [ -n "$addr" ]; then
        update_env "COUNTERPARTY_TOKEN_ADDRESS" "$addr"
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

    # 10. Bridge to Remote
    run_script_no_verify "src/scripts/v2/testnet/10_TestBridgeToRemote.s.sol:TestBridgeToRemote" "$PM_NETWORK_RPC_URL" "Bridging tokens from PM Network to SM Network"

    log_warn "Waiting 90 seconds for LayerZero delivery..."
    sleep 90

    # 11. Bridge Back
    run_script_no_verify "src/scripts/v2/testnet/11_TestBridgeBack.s.sol:TestBridgeBack" "$SM_NETWORK_RPC_URL" "Bridging tokens back from SM Network to PM Network"

    log_success "Phase 5 complete: Bridge test initiated"
}

# Check Status
check_status() {
    log_info "=== Checking Deployment Status ==="

    echo ""
    log_info "PM Network Status:"
    run_script_no_verify "src/scripts/v2/testnet/12a_CheckStatus_PMNetwork.s.sol:CheckStatus_PMNetwork" "$PM_NETWORK_RPC_URL" "Checking PM Network status"

    echo ""
    log_info "SM Network Status:"
    run_script_no_verify "src/scripts/v2/testnet/12b_CheckStatus_SMNetwork.s.sol:CheckStatus_SMNetwork" "$SM_NETWORK_RPC_URL" "Checking SM Network status"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all           Run full deployment (phases 1-4, including DVN config)"
    echo "  deploy        Run deployment only (phases 1-3b)"
    echo "  phase1        Deploy Ethereal infrastructure"
    echo "  phase2        Deploy Arbitrum infrastructure"
    echo "  phase3        Configure bridges (basic: peer, config)"
    echo "  phase3b       Configure DVN and libraries"
    echo "  phase4        Mint position tokens"
    echo "  phase5        Test bridging"
    echo "  test          Run bridge test (phases 4-5)"
    echo "  status        Check deployment status"
    echo ""
    echo "Examples:"
    echo "  $0 all        # Full deployment with DVN config and mint"
    echo "  $0 deploy     # Deploy and configure only (no mint)"
    echo "  $0 phase3b    # Just configure DVN/libraries"
    echo "  $0 status     # Check current status"
    echo ""
    echo "Required env vars for DVN config:"
    echo "  PM_NETWORK_SEND_LIB, PM_NETWORK_RECEIVE_LIB, PM_NETWORK_DVN"
    echo "  SM_NETWORK_SEND_LIB, SM_NETWORK_RECEIVE_LIB, SM_NETWORK_DVN, SM_NETWORK_EXECUTOR"
}

# Main
main() {
    echo "========================================"
    echo "  V2 Bridge Deployment Script"
    echo "========================================"

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
            mint_tokens_phase4
            check_status
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
