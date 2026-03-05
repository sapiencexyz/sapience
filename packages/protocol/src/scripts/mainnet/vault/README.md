# PredictionMarketVault Mainnet Scripts

Scripts for deploying and testing PredictionMarketVault on Ethereal mainnet.

## Overview

These scripts deploy a passive liquidity vault that can act as counterparty in PredictionMarketEscrow predictions. The vault uses a manager (EOA) to sign approvals via ERC-1271.

### Roles

- **Owner**: PM_NETWORK_DEPLOYER - owns the vault, can change settings
- **Manager**: COUNTERPARTY wallet - signs approvals, processes deposits/withdrawals
- **Depositor**: PREDICTOR wallet - deposits/withdraws from vault (for testing)

## Prerequisites

### Environment Variables

Required variables in `.env`:

```bash
# Deployer (becomes vault owner)
PM_NETWORK_DEPLOYER_PRIVATE_KEY=0x...
PM_NETWORK_DEPLOYER_ADDRESS=0x...

# Manager (signs vault approvals, processes requests)
COUNTERPARTY_PRIVATE_KEY=0x...

# Depositor/Predictor (for testing)
PREDICTOR_PRIVATE_KEY=0x...

# Network
PM_NETWORK_RPC_URL=https://rpc.ethereal.trade

# Existing contracts
COLLATERAL_TOKEN_ADDRESS=0x...
PREDICTION_MARKET_ADDRESS=0x...
RESOLVER_ADDRESS=0x...

# After deploying vault (added by 01_DeployVault)
VAULT_ADDRESS=0x...
```

### Fund Accounts

Mint collateral tokens to all three addresses:

```bash
# Mint 10,000 USDe to each address
for addr in $PM_NETWORK_DEPLOYER_ADDRESS $(cast wallet address $PREDICTOR_PRIVATE_KEY) $(cast wallet address $COUNTERPARTY_PRIVATE_KEY); do
  cast send $COLLATERAL_TOKEN_ADDRESS "mint(address,uint256)" $addr 10000ether \
    --private-key $PM_NETWORK_DEPLOYER_PRIVATE_KEY \
    --rpc-url $PM_NETWORK_RPC_URL
done
```

## Scripts

### 1. Deploy Vault

Deploys PredictionMarketVault with COUNTERPARTY as manager.

```bash
forge script src/scripts/mainnet/vault/01_DeployVault.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.ethereal.trade/api/ \
  -vvvv
```

**Output:** Add `VAULT_ADDRESS=0x...` to your `.env`

**Optional env vars:**
- `VAULT_NAME` - Token name (default: "Foil Vault")
- `VAULT_SYMBOL` - Token symbol (default: "FVLT")
- `VAULT_EXPIRATION_TIME` - Request expiration in seconds (default: 600)

### 2. Test Deposit/Withdrawal

Tests the deposit and withdrawal flow:
1. PREDICTOR deposits collateral
2. COUNTERPARTY (manager) processes deposit
3. PREDICTOR requests withdrawal
4. COUNTERPARTY (manager) processes withdrawal

```bash
forge script src/scripts/mainnet/vault/02_TestDepositWithdrawal.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv
```

**Optional env vars:**
- `DEPOSIT_AMOUNT` - Amount to deposit (default: 1 ether)
- `WITHDRAW_AMOUNT` - Amount to withdraw (default: half of deposit)

### 3. Test Vault as Counterparty

Tests the vault acting as counterparty in a PredictionMarketEscrow prediction:
1. Manager approves funds for market
2. Build MintRequest with vault as counterparty
3. Manager signs via ERC-1271
4. Mint prediction
5. Verify vault holds counterparty tokens

```bash
forge script src/scripts/mainnet/vault/03_TestVaultAsCounterparty.s.sol \
  --rpc-url $PM_NETWORK_RPC_URL \
  --broadcast \
  -vvvv
```

**Output:** Adds to `.env`:
- `PREDICTION_ID`
- `PREDICTOR_TOKEN_ADDRESS`
- `COUNTERPARTY_TOKEN_ADDRESS`
- `CONDITION_ID`
- `PICK_CONFIG_ID`

**Optional env vars:**
- `PREDICTOR_COLLATERAL` - Predictor's collateral (default: 1 ether)
- `COUNTERPARTY_COLLATERAL` - Vault's collateral (default: 1/3 of predictor collateral)
- `CONDITION_ID` - Use existing condition ID

## Signature Flow (ERC-1271)

When the vault acts as counterparty, the manager signs on its behalf:

```
1. Compute predictionHash = keccak256(pickConfigId, pCollateral, cCollateral, predictor, vault)
2. Get mintApprovalHash = market.getMintApprovalHash(predictionHash, vault, cCollateral, nonce, deadline)
3. Get vaultApprovalHash = vault.getApprovalHash(mintApprovalHash, manager)
4. Manager signs vaultApprovalHash
5. Market calls vault.isValidSignature(mintApprovalHash, signature)
6. Vault verifies manager signed the wrapped hash
```

## Script Summary

| Script | Description |
|--------|-------------|
| 01_DeployVault | Deploy and configure PredictionMarketVault |
| 02_TestDepositWithdrawal | Test deposit and withdrawal flow |
| 03_TestVaultAsCounterparty | Test vault as counterparty in prediction |

## Verification

After running scripts, verify on Ethereal explorer:
- https://explorer.ethereal.trade/address/{VAULT_ADDRESS}
