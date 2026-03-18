# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sapience Protocol is a decentralized prediction market protocol with fungible prediction pools using a parimutuel model and cross-chain bridge support.

## Commands

### Development

```bash
pnpm test                   # Run all tests using Forge
pnpm docgen                 # Generate documentation with Forge
```

### Testing Individual Files

```bash
# Run specific test file
forge test --match-path test/PredictionMarketEscrow.t.sol -vvv

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
├── bridge/              # Position token bridge (Ethereal <-> Arbitrum)
├── interfaces/          # Interfaces and types
├── resolvers/           # Condition resolvers (pyth/, lz-uma/, conditionalTokens/, mocks/)
├── sponsors/            # Mint sponsors (OnboardingSponsor)
├── utils/               # Signature validation, account factory
├── vault/               # PredictionMarketVault (LP deposits/withdrawals)
├── PredictionMarketEscrow.sol       # Core escrow: mint, burn, settle, redeem
├── PredictionMarketToken.sol        # ERC20 position token
├── PredictionMarketTokenFactory.sol # CREATE3 factory for deterministic addresses
├── SecondaryMarketEscrow.sol        # Atomic OTC swap for position tokens
└── scripts/
    ├── debug/           # Debug scripts
    ├── mainnet/         # Mainnet deployment scripts
    └── testnet/         # Testnet deployment scripts
test/
├── fixtures/            # Hash fixture generation for SDK golden tests
├── mocks/               # Mock contracts for testing
├── vault/               # Vault-specific tests
└── *.t.sol              # Test files
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

See `src/spec.md` for the complete specification.

### Core Concepts

- **Pick**: A single prediction (conditionResolver, conditionId, predictedOutcome)
- **Pick Configuration**: Set of picks that share fungible tokens, identified by `pickConfigId = keccak256(picks)`
- **Prediction**: Individual prediction with unique `predictionId = keccak256(pickConfigId, predictor, counterparty, nonce)`
- **Position Tokens**: ERC20 tokens representing shares in the collateral pool (1:1 ratio with collateral)

### Parimutuel Model

Users with the same picks share fungible tokens. Both sides of a mint receive tokens equal to the prediction's total collateral (predictor + counterparty). This bakes the odds into the token amount, keeping tokens fungible regardless of the odds at which each prediction was placed. Winner side gets all collateral proportionally to tokens held.

### Main Contracts

- **PredictionMarketEscrow.sol**: Core escrow handling mint, burn, settle, redeem. Uses bitmap nonces (Permit2-style) and supports session keys with revocation
- **PredictionMarketToken.sol**: ERC20 position token with pickConfigId and isPredictorToken metadata
- **PredictionMarketTokenFactory.sol**: CREATE3 factory for deterministic token addresses across chains
- **SecondaryMarketEscrow.sol**: Permissionless atomic OTC swap for position tokens (no ownership, no funds at rest)
- **PredictionMarketVault.sol**: Passive liquidity vault for LP deposits/withdrawals with request-based flow
- **OnboardingSponsor.sol**: Funds predictor collateral during mint, gated by per-user budgets
- **IConditionResolver**: Interface for condition resolution returning `OutcomeVector [yesWeight, noWeight]`

### Condition Resolvers

Located in `src/resolvers/`:

- **PythConditionResolver** (`pyth/`): Pyth oracle-based resolution
- **ManualConditionResolver** (`mocks/`): Admin-controlled resolution
- **LZConditionResolver** (`lz-uma/`): Cross-chain resolution via LayerZero (Ethereal side)
- **LZConditionResolverUmaSide** (`lz-uma/`): UMA oracle side for cross-chain resolution
- **ConditionalTokensConditionResolver** (`conditionalTokens/`): Gnosis conditional tokens integration
- **ConditionalTokensReader** (`conditionalTokens/`): Reads Gnosis CT payouts and sends to Ethereal via LZ

### Resolution Flow

1. Condition resolvers return `OutcomeVector [yesWeight, noWeight]`
   - `[1,0]` = YES wins, `[0,1]` = NO wins, `[1,1]` = tie
2. PredictionMarketEscrow applies prediction logic:
   - All picks match predicted outcome -> PREDICTOR_WINS
   - Any pick decisively against -> COUNTERPARTY_WINS
   - Any non-decisive pick (tie/ambiguous) -> COUNTERPARTY_WINS

### Bridge (Position Token Bridge)

Bridges position tokens between Ethereal and Arbitrum using LayerZero with two-phase commit (ACK).

**Architecture:**

```
PredictionMarketBridgeBase (abstract)
├── PredictionMarketBridge (Ethereal - source chain)
└── PredictionMarketBridgeRemote (Arbitrum - remote chain)
```

**Key Features:**

- Unified interface: `bridge()`, `retry()` on both chains
- Permissionless retry after 1 hour delay
- Idempotent processing prevents double-mint/release
- CREATE3 for deterministic token addresses across chains
- Automatic token deployment on first bridge

**Contracts:**

- `PredictionMarketBridgeBase.sol`: Abstract base with shared logic
- `PredictionMarketBridge.sol`: Ethereal side (escrow, release)
- `PredictionMarketBridgeRemote.sol`: Arbitrum side (mint, burn)
- `PredictionMarketTokenFactory.sol`: CREATE3 factory for deterministic addresses
- `PredictionMarketToken.sol`: Same ERC20 deployed on remote chain with bridge as mint/burn authority

## Rules

- All tests must pass before commit
- Run lint and format before commit
- To run lint and format, execute `pnpm format && pnpm lint` inside protocol package folder

## Key Dependencies

- **@openzeppelin/contracts**: Standard implementations (ERC20, access control, security)
- **@layerzerolabs/oapp-evm**: Cross-chain messaging via LayerZero
- **solady**: CREATE3 for deterministic cross-chain token deployment
- **@uma/core**: UMA Optimistic Oracle integration for condition resolution
