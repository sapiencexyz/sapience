# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foil Protocol is a decentralized prediction market protocol with fungible betting pools using a parimutuel model and cross-chain bridge support.

## Commands

### Development
```bash
pnpm dev                    # Start local development with Anvil on port 8545
pnpm test                   # Run all tests using Cannon and Forge
pnpm docgen                 # Generate documentation with Forge
```

### Deployment
```bash
pnpm deploy:sepolia         # Deploy to Sepolia testnet
pnpm deploy:base           # Deploy to Base mainnet
pnpm simulate-deploy:sepolia # Dry-run deployment on Sepolia
pnpm simulate-deploy:base   # Dry-run deployment on Base

# Manual cannon deployment (example from README)
pnpm cannon build deployments/tomls/base-mainnet/foil-with-factory.toml --chain-id 8453 --wipe --dry-run --impersonate-all
```

### Testing Individual Files
```bash
# Run specific test file
forge test --match-path test/market/modules/LiquidityModule/CreateLiquidityPosition.t.sol -vvv

# Run specific test function
forge test --match-test test_revertWhen_invalidEpoch -vvv
```

### Linting and Formatting
```bash
pnpm lint # lint solidity source files
pnpm fmt  # format solidity source files
```

## Directory Structure

```
src/
├── v2/                  # Main protocol
│   ├── bridge/          # Position token bridge (Ethereal <-> Arbitrum)
│   ├── interfaces/      # V2 interfaces
│   ├── resolvers/       # Condition resolvers
│   ├── utils/           # Signature validation, account factory
│   ├── PredictionMarketEscrow.sol
│   ├── PredictionMarketToken.sol
│   └── v2.md            # Detailed specification
├── predictionMarket/    # Legacy prediction market
├── bridge/              # LayerZero bridge utilities
├── vault/               # Passive liquidity vault
└── external/            # External interfaces
```

## Contract Verification

**Polygon (Polygonscan):**
```bash
forge verify-contract \
  $CONTRACT_ADDRESS \
  $CONTRACT_PATH \
  --chain-id 137 \
  --constructor-args $CONSTRUCTOR_ARGS \
  --etherscan-api-key $POLYGONSCAN_API_KEY
```

**Ethereal (Blockscout):**
```bash
# IMPORTANT: Ethereal uses Blockscout - always include these flags
forge verify-contract \
  $CONTRACT_ADDRESS \
  $CONTRACT_PATH \
  --chain-id 5066318 \
  --constructor-args $CONSTRUCTOR_ARGS \
  --verifier blockscout \
  --verifier-url https://explorer.ethereal.trade/api/
```

**Note**: For Ethereal, you must always use `--verifier blockscout --verifier-url https://explorer.ethereal.trade/api/` when using `forge verify-contract` or `forge script` with `--verify`.

## Architecture

See `src/v2/v2.md` for the complete specification.

### Core Concepts

- **Pick**: A single prediction (conditionResolver, conditionId, predictedOutcome)
- **Pick Configuration**: Set of picks that share fungible tokens, identified by `pickConfigId = keccak256(picks)`
- **Prediction**: Individual bet with unique `predictionId = keccak256(pickConfigId, predictor, counterparty, nonce)`
- **Position Tokens**: ERC20 tokens representing shares in the collateral pool (1:1 ratio with wager)

### Parimutuel Model

Users with the same picks share tokens. Token supply equals total wagers:
- Mint 50 USDE -> receive 50 predictor tokens
- Winner side gets all collateral proportionally

### Main Contracts

- **PredictionMarketEscrow.sol**: Core contract handling mint, settle, redeem
- **PredictionMarketToken.sol**: ERC20 position token with pickConfigId and isPredictorToken metadata
- **IConditionResolver**: Interface for condition resolution returning `OutcomeVector [yesWeight, noWeight]`

### Condition Resolvers

Located in `src/v2/resolvers/`:
- **PythConditionResolver**: Pyth oracle-based resolution
- **ManualConditionResolver**: Admin-controlled resolution
- **LZConditionResolver**: Cross-chain resolution via LayerZero
- **ConditionalTokensConditionResolver**: Gnosis conditional tokens integration

### Resolution Flow

1. Condition resolvers return `OutcomeVector [yesWeight, noWeight]`
   - `[1,0]` = YES wins, `[0,1]` = NO wins, `[1,1]` = tie
2. PredictionMarketEscrow applies parlay logic:
   - All picks match predicted outcome -> PREDICTOR_WINS
   - Any pick decisively against -> COUNTERPARTY_WINS
   - Any non-decisive pick -> NON_DECISIVE (tie)

### Bridge (Position Token Bridge)

Bridges position tokens between Ethereal and Arbitrum using LayerZero with two-phase commit (ACK).

**Architecture:**
```
PredictionMarketBridgeBase (abstract)
├── PositionTokenBridge (Ethereal - source chain)
└── PositionTokenBridgeRemote (Arbitrum - remote chain)
```

**Key Features:**
- Unified interface: `bridge()`, `retry()` on both chains
- Permissionless retry after 1 hour delay
- Idempotent processing prevents double-mint/release
- CREATE3 for deterministic token addresses across chains
- Automatic token deployment on first bridge

**Contracts:**
- `PredictionMarketBridgeBase.sol`: Abstract base with shared logic
- `PositionTokenBridge.sol`: Ethereal side (escrow, release)
- `PositionTokenBridgeRemote.sol`: Arbitrum side (mint, burn)
- `PositionTokenFactory.sol`: CREATE3 factory
- `BridgedPositionToken.sol`: Mintable/burnable ERC20 on Arbitrum

### Deployment Configuration

Cannon deployment system using TOML files in `deployments/tomls/`:
- `cannonfile.dev.toml`: Local development
- `cannonfile.test.toml`: Test configuration
- `cannonfile.sepolia.toml`: Sepolia testnet
- `cannonfile.base.blobs.toml`: Base mainnet

## Rules

- All tests must pass before commit
- Run lint and format before commit 
- To run lint and format, execute `pnpm format && pnpm lint` inside protocol package folder

## Key Dependencies

- **@openzeppelin/contracts**: Standard implementations
- **@layerzerolabs/lz-evm-oapp-v2**: Cross-chain messaging
- **cannon-std**: Deployment and testing utilities
