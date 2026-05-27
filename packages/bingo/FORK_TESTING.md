# Fork testing

Run the bingo app against an Anvil fork of Ethereal mainnet with a mock Pyth
Entropy. Useful for end-to-end testing the mint → reveal → setCellSides →
fundMint → claimBonus flow without touching real entropy or real markets.

## 1. Fork Ethereal in one terminal

```bash
anvil --fork-url https://rpc.ethereal.trade --chain-id 5064014
```

Default Anvil port is 8545.

## 2. Deploy BingoCard + MockEntropy in another terminal

```bash
cd packages/protocol
export PM_NETWORK_DEPLOYER_ADDRESS=0xYourEoa
export PM_NETWORK_DEPLOYER_PRIVATE_KEY=0xYourKey
export COLLATERAL_TOKEN_ADDRESS=0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D  # wUSDe mainnet
forge script src/scripts/deploy/DeployBingoCardFork.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast
```

The script prints the deployed `BingoCard` and `MockEntropy` addresses.

## 3. Fund your wallet with wUSDe

Impersonate any wUSDe holder (`cast call` against the token's `Transfer` events
to find one, or use a known whale).

```bash
WUSDE=0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D
WHALE=0xSomeAddressWithWusde
YOU=0xYourEoa

cast rpc anvil_impersonateAccount $WHALE
cast rpc anvil_setBalance $WHALE 0x1000000000000000000  # 1 ETH for gas
cast send $WUSDE "transfer(address,uint256)" $YOU 1000000000000000000000 \
  --from $WHALE --unlocked
```

## 4. Point the FE at the fork

```bash
cd packages/bingo
echo "VITE_ETHEREAL_RPC_URL=http://localhost:8545" > .env.local
pnpm dev
```

In MetaMask, add a network: RPC `http://localhost:8545`, chain id `5064014`.

## 5. Configure the contract from the admin UI

Open `http://localhost:3100/admin`:

1. Paste the deployed `BingoCard` address into "Contract address" → Save.
2. Connect wallet (the deployer EOA is the owner).
3. Set pool (search + pick 16+ conditions, or paste your own).
4. Set card price, referral bps, expiry, multipliers.
5. Approve + deposit bonus pool.

## 6. Mint and reveal

1. `/play` → Mint card. FE auto-redirects to `/card/:id`.
2. `/admin` → "Pending reveals" section → click **Push reveal** for the
   pending card. This calls `MockEntropy.pushCallback(seq, provider, random)`.
3. `/card/:id` polls every 3s and will flip to revealed.
4. Pick YES/NO on each cell → Submit picks.
5. (Funding 10 lines via the escrow is not yet wired into the FE.)
6. Once all 10 lines are funded, claim bonus from the card detail page.

## Notes

- The mock entropy fee defaults to **1 wei** so `mintCard` doesn't fail on the
  fork. Override with `ENTROPY_FEE_WEI` in the deploy step.
- `pushCallback` is callable by anyone on the mock — that's intentional, since
  the fork helper drives it from the admin UI rather than imitating Pyth's
  provider signature flow.
- Real Pyth Entropy is **not** exposed via `pushCallback`. The button is a
  fork-only convenience and will fail against the real entropy address.
