---
name: migrate-vault
description: Migrate funds from the current PredictionMarketVault to a new one on Ethereal mainnet
allowed-tools: Bash(cast *), Read, Grep, Glob
---

# Vault Migration

Withdraw all funds from the current vault and deposit into a new vault on Ethereal mainnet.

## Prerequisites

The user must provide:
- **New vault address** (or tell you it's already updated in `packages/sdk/contracts/addresses.ts`)
- **Depositor private key** (or a placeholder — never log or echo PKs)
- **Manager private key** (or a placeholder)

## Constants

- **RPC:** `https://rpc.ethereal.trade/`
- **Chain ID:** `5064014` (Ethereal mainnet)
- **WUSDe (collateral):** `0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D`
- **Depositor EOA:** `0xdb5Af497A73620d881561eDb508012A5f84e9BA2`

## Steps

### 1. Resolve addresses

Read the current vault address from `packages/sdk/contracts/addresses.ts` under `predictionMarketVault[5064014].address`. If the user provided a new vault address, use it. Otherwise check if the SDK was already updated.

The old vault is either:
- The current `predictionMarketVault[5064014].address` (if SDK not yet updated), or
- The first entry in `predictionMarketVault[5064014].legacy` (if SDK already updated)

### 2. Verify on-chain state

Run these checks with `cast call` against the RPC:

```
# Both vaults must share the same manager
cast call <OLD_VAULT> "manager()(address)" --rpc-url https://rpc.ethereal.trade/
cast call <NEW_VAULT> "manager()(address)" --rpc-url https://rpc.ethereal.trade/

# Depositor's share balance in old vault
cast call <OLD_VAULT> "balanceOf(address)(uint256)" <DEPOSITOR> --rpc-url https://rpc.ethereal.trade/

# WUSDe held by old vault (what depositor will receive)
cast call 0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D "balanceOf(address)(uint256)" <OLD_VAULT> --rpc-url https://rpc.ethereal.trade/

# Available assets (not locked in escrow)
cast call <OLD_VAULT> "availableAssets()(uint256)" --rpc-url https://rpc.ethereal.trade/

# Interaction delay — last interaction must be > delay seconds ago
cast call <OLD_VAULT> "depositInteractionDelay()(uint256)" --rpc-url https://rpc.ethereal.trade/
cast call <OLD_VAULT> "lastUserInteractionTimestamp(address)(uint256)" <DEPOSITOR> --rpc-url https://rpc.ethereal.trade/
```

Print a summary table of: old vault, new vault, manager, depositor shares, available WUSDe, interaction delay status.

If managers don't match, STOP and tell the user.

### 3. Generate cast commands

Print all 5 commands with `<DEPOSITOR_PK>` and `<MANAGER_PK>` placeholders. Use the actual on-chain values for amounts.

**Step 1 — Request withdrawal from old vault:**
```
cast send <OLD_VAULT> "requestWithdrawal(uint256,uint256)" <SHARES> <AVAILABLE_ASSETS> --rpc-url https://rpc.ethereal.trade/ --private-key <DEPOSITOR_PK>
```

**Step 2 — Manager processes withdrawal (within 10 min):**
```
cast send <OLD_VAULT> "processWithdrawal(address)" <DEPOSITOR> --rpc-url https://rpc.ethereal.trade/ --private-key <MANAGER_PK>
```
> Note: A vault-bot service may auto-process this. If step 2 reverts with `NoPendingRequests`, it was already processed — skip to step 3.

**Step 3 — Approve new vault to spend WUSDe:**
```
cast send 0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D "approve(address,uint256)" <NEW_VAULT> <AMOUNT> --rpc-url https://rpc.ethereal.trade/ --private-key <DEPOSITOR_PK>
```

**Step 4 — Request deposit into new vault:**
```
cast send <NEW_VAULT> "requestDeposit(uint256,uint256)" <AMOUNT> <AMOUNT> --rpc-url https://rpc.ethereal.trade/ --private-key <DEPOSITOR_PK>
```

**Step 5 — Manager processes deposit (within 10 min):**
```
cast send <NEW_VAULT> "processDeposit(address)" <DEPOSITOR> --rpc-url https://rpc.ethereal.trade/ --private-key <MANAGER_PK>
```
> Note: Vault-bot may auto-process this too.

### 4. Verify after each step

After the user runs each command (or group of commands), verify with `cast call`:
- After steps 1-2: depositor WUSDe balance increased, old vault shares = 0
- After steps 3-5: new vault WUSDe balance increased, depositor has shares in new vault

### 5. Post-migration checklist

Remind the user to:
- Update `VAULT_ADDRESS` in Railway env vars for all vault-bot services
- Redeploy vault-bot services
- Update `predictionMarketVault` in `packages/sdk/contracts/addresses.ts` if not already done (move old address to `legacy`)

## Important notes

- The depositor can only have ONE pending request at a time
- Requests expire after 10 minutes — manager must process before then
- There's a 1-day interaction delay between requests on the same vault
- If the user wants to deposit less than the full withdrawal amount, ask them to specify
- Never echo or log private keys
- `0x2c01223f` = `NoPendingRequests(address)` — means vault-bot already processed it
