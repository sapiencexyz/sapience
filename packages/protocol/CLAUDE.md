# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foil Protocol is a decentralized marketplace for onchain computing resources, specifically focused on prediction markets. The protocol uses Solidity smart contracts built with Foundry framework and deployed using Cannon CLI.

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

## Architecture

### Module System
The protocol uses a diamond-like modular architecture where functionality is split into separate modules combined via a router pattern:

- **ConfigurationModule**: Market initialization, epoch creation, ownership
- **LiquidityModule**: LP position management (create, increase, decrease)
- **TradeModule**: Trading operations
- **SettlementModule**: Core settlement functionality
- **UMASettlementModule**: UMA Optimistic Oracle V3 integration
- **ViewsModule**: Read-only view functions
- **NftModule**: ERC721 position NFTs

### Storage Pattern
Uses diamond storage pattern with deterministic slots:
```solidity
bytes32 slot = keccak256("foil.gas.market");
```

Key storage contracts:
- `Market.sol`: Core market configuration and state
- `Position.sol`: Position data (trades and liquidity)
- `Epoch.sol`: Time-bound trading periods with Uniswap V3 pools
- `Debt.sol`: Borrowing and collateral tracking

### Virtual Token System
- Each epoch has virtual tokens (vETH and vGAS) representing long/short positions
- Tokens are minted/burned for trades and liquidity provision
- Integrated with Uniswap V3 for price discovery

### Settlement Flow
1. Epochs run for a predetermined period
2. After epoch ends, UMA oracle submits settlement price
3. Positions can be settled based on final price
4. Special handling for fee collectors and liquidations

### Deployment Configuration
Cannon deployment system using TOML files in `deployments/tomls/`:
- `cannonfile.dev.toml`: Local development
- `cannonfile.test.toml`: Test configuration
- `cannonfile.sepolia.toml`: Sepolia testnet
- `cannonfile.base.blobs.toml`: Base mainnet with blob storage

## Key Dependencies
- **@synthetixio/core-contracts**: Core infrastructure patterns
- **@uma/core**: Optimistic Oracle V3 for price discovery
- **@uniswap/v3-core & v3-periphery**: AMM functionality
- **@openzeppelin/contracts**: Standard implementations
- **cannon-std**: Deployment and testing utilities