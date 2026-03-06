# EIP-712 Signing Reference

All signing in Sapience uses standard EIP-712 typed data. The SDK's `build*TypedData()` helpers return standard typed data objects — pass them to any EIP-712 signer (viem, ethers, web3.js, browser wallets, hardware wallets, smart accounts).

## Primary Market Domain

Same domain for all primary market signatures:

```json
{
  "name": "PredictionMarketEscrow",
  "version": "1",
  "chainId": 5064014,
  "verifyingContract": "<predictionMarketEscrow address from SDK>"
}
```

`verifyingContract` is the **escrow contract address** (not the signer's address). Get it from `predictionMarketEscrow[CHAIN_ID_ETHEREAL].address`.

## AuctionIntent (relayer-only, NOT verified on-chain)

Lightweight auth proving predictor identity + intent. Signed at auction start.

```
AuctionIntent(Pick[] picks, address predictor, uint256 predictorCollateral, uint256 predictorNonce, uint256 predictorDeadline)
Pick(address conditionResolver, bytes32 conditionId, uint8 predictedOutcome)
```

## MintApproval (verified on-chain)

Both predictor and counterparty sign a MintApproval before `mint()` is called.

```
MintApproval(bytes32 predictionHash, address signer, uint256 collateral, uint256 nonce, uint256 deadline)
```

Where `predictionHash = keccak256(abi.encode(pickConfigId, predictorCollateral, counterpartyCollateral, predictor, counterparty, predictorSponsor, predictorSponsorData))`

Each party signs with their own address as `signer`, their own collateral as `collateral`, and their own nonce/deadline.

## BurnApproval (verified on-chain)

Both holders sign a BurnApproval before `burn()` is called (used for cooperative early exit).

```
BurnApproval(bytes32 burnHash, address signer, uint256 tokenAmount, uint256 payout, uint256 nonce, uint256 deadline)
```

Where `burnHash = keccak256(abi.encode(pickConfigId, predictorTokenAmount, counterpartyTokenAmount, predictorHolder, counterpartyHolder, predictorPayout, counterpartyPayout))`

## Secondary Market Domain

```json
{
  "name": "SecondaryMarketEscrow",
  "version": "1",
  "chainId": 5064014,
  "verifyingContract": "<secondaryMarketEscrow address from SDK>"
}
```

## TradeApproval (secondary market, verified on-chain)

```
TradeApproval(bytes32 tradeHash, address signer, uint256 nonce, uint256 deadline)
```

Where `tradeHash = keccak256(abi.encode(token, collateral, seller, buyer, tokenAmount, price))`

## SDK Helpers

All imported from `@sapience/sdk/auction/escrowSigning`:
- `buildAuctionIntentTypedData()` — taker's relayer auth
- `buildPredictorMintTypedData()` — predictor's on-chain MintApproval
- `buildCounterpartyMintTypedData()` — counterparty's on-chain MintApproval
- `buildPredictorBurnTypedData()` — predictor holder's BurnApproval
- `buildCounterpartyBurnTypedData()` — counterparty holder's BurnApproval

From `@sapience/sdk/auction/secondarySigning`:
- `buildSellerTradeApproval()` — seller's TradeApproval
- `buildBuyerTradeApproval()` — buyer's TradeApproval
- `computeTradeHash()` — compute tradeHash for verification
