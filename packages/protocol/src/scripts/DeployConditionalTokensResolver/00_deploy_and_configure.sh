#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Deploy and Configure ConditionalTokens Resolver System
# ============================================================================
#
# This script orchestrates the deployment and initial configuration of:
# 1. ConditionalTokensReader on Polygon
# 2. PredictionMarketLZConditionalTokensResolver on Ethereal
# 3. Configuration of both contracts
#
# Prerequisites:
#   - All required environment variables set (see README.md)
#   - forge installed and in PATH
#   - Sufficient balance on both networks
#
# Usage:
#   bash src/scripts/DeployConditionalTokensResolver/00_deploy_and_configure.sh
#
# Optional flags:
#   --verify              Verify Polygon contract automatically (requires POLYGONSCAN_API_KEY)
#   --skip-polygon        Skip Polygon deployment (use existing POLYGON_CONDITIONAL_TOKENS_READER)
#   --skip-ethereal       Skip Ethereal deployment (use existing ETHEREAL_CONDITIONAL_TOKENS_RESOLVER)
#   --skip-config         Skip configuration steps (only deploy)
#   --no-env-file         Skip loading .env file (use only exported variables)
#
# Environment Variables:
#   The script will automatically load variables from packages/protocol/.env if it exists.
#   Variables set in the environment take precedence over .env file values.
#
# ============================================================================

# Resolve directories
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)

# Change to protocol directory
cd "$PROTOCOL_DIR"

# Parse flags
VERIFY=false
SKIP_POLYGON=false
SKIP_ETHEREAL=false
SKIP_CONFIG=false
NO_ENV_FILE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verify)
            VERIFY=true
            shift
            ;;
        --skip-polygon)
            SKIP_POLYGON=true
            shift
            ;;
        --skip-ethereal)
            SKIP_ETHEREAL=true
            shift
            ;;
        --skip-config)
            SKIP_CONFIG=true
            shift
            ;;
        --no-env-file)
            NO_ENV_FILE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--verify] [--skip-polygon] [--skip-ethereal] [--skip-config] [--no-env-file]"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables from .env file if it exists
load_env_file() {
    local env_file="$PROTOCOL_DIR/.env"
    
    if [[ -f "$env_file" ]]; then
        log_info "Loading environment variables from .env file..."
        
        # Read and export variables from .env file, ignoring comments and empty lines
        # Environment variables already set take precedence over .env file values
        while IFS= read -r line || [[ -n "$line" ]]; do
            # Skip comments and empty lines
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "${line// }" ]] && continue
            
            # Parse KEY=value format
            if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
                local key="${BASH_REMATCH[1]// /}"
                local value="${BASH_REMATCH[2]}"
                
                # Remove quotes if present (handles both single and double quotes)
                value="${value#\"}"
                value="${value%\"}"
                value="${value#\'}"
                value="${value%\'}"
                
                # Only export if variable is not already set
                # This allows environment variables to override .env file values
                if [[ -z "${!key:-}" ]]; then
                    export "$key"="$value"
                fi
            fi
        done < <(grep -v '^[[:space:]]*#' "$env_file" | grep -v '^[[:space:]]*$')
        
        log_success "Environment variables loaded from .env (existing env vars take precedence)"
    else
        log_warning ".env file not found at $env_file"
        log_warning "Make sure all required environment variables are set manually"
    fi
}

# Check required environment variables
check_env() {
    local missing=()
    
    if [[ "$SKIP_POLYGON" == "false" ]]; then
        [[ -z "${POLYGON_LZ_ENDPOINT:-}" ]] && missing+=("POLYGON_LZ_ENDPOINT")
        [[ -z "${POLYGON_OWNER:-}" ]] && missing+=("POLYGON_OWNER")
        [[ -z "${POLYGON_PRIVATE_KEY:-}" ]] && missing+=("POLYGON_PRIVATE_KEY")
        [[ -z "${POLYGON_RPC:-}" ]] && missing+=("POLYGON_RPC")
    fi
    
    if [[ "$SKIP_ETHEREAL" == "false" ]]; then
        [[ -z "${ETHEREAL_LZ_ENDPOINT:-}" ]] && missing+=("ETHEREAL_LZ_ENDPOINT")
        [[ -z "${ETHEREAL_OWNER:-}" ]] && missing+=("ETHEREAL_OWNER")
        [[ -z "${ETHEREAL_PRIVATE_KEY:-}" ]] && missing+=("ETHEREAL_PRIVATE_KEY")
        [[ -z "${ETHEREAL_RPC:-}" ]] && missing+=("ETHEREAL_RPC")
    fi
    
    if [[ "$SKIP_CONFIG" == "false" ]]; then
        [[ -z "${POLYGON_CONDITIONAL_TOKENS_READER:-}" && "$SKIP_POLYGON" == "true" ]] && missing+=("POLYGON_CONDITIONAL_TOKENS_READER")
        [[ -z "${ETHEREAL_CONDITIONAL_TOKENS_RESOLVER:-}" && "$SKIP_ETHEREAL" == "true" ]] && missing+=("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER")
        [[ -z "${POLYGON_EID:-}" ]] && missing+=("POLYGON_EID")
        [[ -z "${ETHEREAL_EID:-}" ]] && missing+=("ETHEREAL_EID")
    fi
    
    if [[ "$VERIFY" == "true" ]]; then
        [[ -z "${POLYGONSCAN_API_KEY:-}" ]] && missing+=("POLYGONSCAN_API_KEY")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Please set these variables and try again."
        exit 1
    fi
}

# Extract contract address from forge script output
extract_address() {
    local output="$1"
    local pattern="$2"
    echo "$output" | grep -oE "$pattern" | head -1 | tr -d '='
}

# Step 1: Deploy ConditionalTokensReader on Polygon
deploy_polygon_reader() {
    if [[ "$SKIP_POLYGON" == "true" ]]; then
        log_warning "Skipping Polygon deployment (using existing POLYGON_CONDITIONAL_TOKENS_READER)"
        return 0
    fi
    
    log_info "Step 1/4: Deploying ConditionalTokensReader on Polygon..."
    
    local verify_flags=""
    if [[ "$VERIFY" == "true" ]]; then
        verify_flags="--verify --etherscan-api-key $POLYGONSCAN_API_KEY"
        log_info "Verification enabled (will verify on Polygonscan)"
    fi
    
    local output=$(forge script src/scripts/DeployConditionalTokensResolver/01_Polygon_deployReader.s.sol \
        --rpc-url "$POLYGON_RPC" \
        --broadcast \
        --private-key "$POLYGON_PRIVATE_KEY" \
        $verify_flags \
        -vvv 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_error "Polygon deployment failed!"
        echo "$output"
        exit 1
    fi
    
    # Extract deployed address
    local address=$(extract_address "$output" "ConditionalTokensReader deployed to: 0x[a-fA-F0-9]{40}")
    
    if [[ -n "$address" ]]; then
        export POLYGON_CONDITIONAL_TOKENS_READER="$address"
        log_success "ConditionalTokensReader deployed to: $address"
        echo ""
        echo "Set this in your environment:"
        echo "  export POLYGON_CONDITIONAL_TOKENS_READER=$address"
        echo ""
    else
        log_warning "Could not extract deployed address from output"
        log_warning "Please set POLYGON_CONDITIONAL_TOKENS_READER manually and continue"
        echo $output
    fi
}

# Step 2: Deploy Resolver on Ethereal
deploy_ethereal_resolver() {
    if [[ "$SKIP_ETHEREAL" == "true" ]]; then
        log_warning "Skipping Ethereal deployment (using existing ETHEREAL_CONDITIONAL_TOKENS_RESOLVER)"
        return 0
    fi
    
    log_info "Step 2/4: Deploying PredictionMarketLZConditionalTokensResolver on Ethereal..."
    
    local output=$(forge script src/scripts/DeployConditionalTokensResolver/02_Ethereal_deployResolver.s.sol \
        --rpc-url "$ETHEREAL_RPC" \
        --broadcast \
        --private-key "$ETHEREAL_PRIVATE_KEY" \
        -vvv 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_error "Ethereal deployment failed!"
        echo "$output"
        exit 1
    fi
    
    # Extract deployed address
    local address=$(extract_address "$output" "PredictionMarketLZConditionalTokensResolver deployed to: 0x[a-fA-F0-9]{40}")
    
    if [[ -n "$address" ]]; then
        export ETHEREAL_CONDITIONAL_TOKENS_RESOLVER="$address"
        log_success "PredictionMarketLZConditionalTokensResolver deployed to: $address"
        echo ""
        echo "Set this in your environment:"
        echo "  export ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=$address"
        echo ""
    else
        log_warning "Could not extract deployed address from output"
        log_warning "Please set ETHEREAL_CONDITIONAL_TOKENS_RESOLVER manually and continue"
    fi
}

# Step 3: Configure Polygon Reader
configure_polygon_reader() {
    if [[ "$SKIP_CONFIG" == "true" ]]; then
        log_warning "Skipping configuration steps"
        return 0
    fi
    
    if [[ -z "${POLYGON_CONDITIONAL_TOKENS_READER:-}" ]]; then
        log_error "POLYGON_CONDITIONAL_TOKENS_READER is not set"
        exit 1
    fi
    
    if [[ -z "${ETHEREAL_CONDITIONAL_TOKENS_RESOLVER:-}" ]]; then
        log_error "ETHEREAL_CONDITIONAL_TOKENS_RESOLVER is not set"
        exit 1
    fi
    
    log_info "Step 3/4: Configuring Polygon ConditionalTokensReader..."
    
    local output=$(forge script src/scripts/DeployConditionalTokensResolver/03_Polygon_configureReader.s.sol \
        --rpc-url "$POLYGON_RPC" \
        --broadcast \
        --private-key "$POLYGON_PRIVATE_KEY" \
        -vvv 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_error "Polygon configuration failed!"
        echo "$output"
        exit 1
    fi
    
    log_success "Polygon reader configured successfully"
}

# Step 4: Configure Ethereal Resolver
configure_ethereal_resolver() {
    if [[ "$SKIP_CONFIG" == "true" ]]; then
        log_warning "Skipping configuration steps"
        return 0
    fi
    
    if [[ -z "${POLYGON_CONDITIONAL_TOKENS_READER:-}" ]]; then
        log_error "POLYGON_CONDITIONAL_TOKENS_READER is not set"
        exit 1
    fi
    
    if [[ -z "${ETHEREAL_CONDITIONAL_TOKENS_RESOLVER:-}" ]]; then
        log_error "ETHEREAL_CONDITIONAL_TOKENS_RESOLVER is not set"
        exit 1
    fi
    
    log_info "Step 4/4: Configuring Ethereal PredictionMarketLZConditionalTokensResolver..."
    
    local output=$(forge script src/scripts/DeployConditionalTokensResolver/04_Ethereal_configureResolver.s.sol \
        --rpc-url "$ETHEREAL_RPC" \
        --broadcast \
        --private-key "$ETHEREAL_PRIVATE_KEY" \
        -vvv 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_error "Ethereal configuration failed!"
        echo "$output"
        exit 1
    fi
    
    log_success "Ethereal resolver configured successfully"
}

# Main execution
main() {
    echo "============================================================================"
    echo "Deploy and Configure ConditionalTokens Resolver System"
    echo "============================================================================"
    echo ""
    
    # Load .env file first (before checking env vars) unless disabled
    if [[ "$NO_ENV_FILE" == "false" ]]; then
        load_env_file
        echo ""
    else
        log_info "Skipping .env file loading (--no-env-file flag set)"
        echo ""
    fi
    
    check_env
    
    echo "Configuration:"
    echo "  Verify Polygon contract: $VERIFY"
    echo "  Skip Polygon deployment: $SKIP_POLYGON"
    echo "  Skip Ethereal deployment: $SKIP_ETHEREAL"
    echo "  Skip configuration: $SKIP_CONFIG"
    echo ""
    
    deploy_polygon_reader
    deploy_ethereal_resolver
    configure_polygon_reader
    configure_ethereal_resolver
    
    echo ""
    echo "============================================================================"
    log_success "Deployment and configuration complete!"
    echo "============================================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Configure LayerZero DVNs:"
    echo "     - Run script 05_Polygon_setDVN.s.sol"
    echo "     - Run script 06_Ethereal_setDVN.s.sol"
    echo ""
    echo "  2. Test the flow:"
    echo "     - Run script 07_Polygon_testFlow.s.sol"
    echo "     - Run script 08_Ethereal_verifyResolution.s.sol"
    echo ""
    echo "Deployed addresses:"
    [[ -n "${POLYGON_CONDITIONAL_TOKENS_READER:-}" ]] && echo "  POLYGON_CONDITIONAL_TOKENS_READER=$POLYGON_CONDITIONAL_TOKENS_READER"
    [[ -n "${ETHEREAL_CONDITIONAL_TOKENS_RESOLVER:-}" ]] && echo "  ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=$ETHEREAL_CONDITIONAL_TOKENS_RESOLVER"
    echo ""
}

main "$@"

