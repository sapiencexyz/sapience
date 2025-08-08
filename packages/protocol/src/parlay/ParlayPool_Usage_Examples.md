# ParlayPool Contract Usage Examples

This document explains how to use the ParlayPool contract with practical examples featuring three users: **Ana** (maker), **Bob** and **Carl** (takers).

## Overview

The ParlayPool implements a true orderbook-style parlay system where:
- **Makers** submit parlay orders with their collateral and desired outcomes
- **Takers** compete by directly filling orders with their preferred payouts
- The **first taker to fill** within the order expiration time wins
- Takers only provide the delta (profit amount), not the full payout
- After market resolution, the **winner** (maker or taker) withdraws collateral + payout
- Parlays can only be settled after 30 days from creation (expiration period)

## Approved Takers Feature

The ParlayPool supports a global approved takers list that restricts who can fill parlay orders:

- **Empty List**: When the approved takers list is empty, anyone can fill any parlay order (unlimited access)
- **Restricted List**: When the approved takers list contains addresses, only those addresses can fill parlay orders
- **Global Setting**: The approved takers list is set at contract deployment and applies to all orders
- **Security**: This feature allows for controlled access to parlay filling, useful for testing or restricted environments

### Example Usage:
```solidity
// Allow anyone to fill orders
address[] memory approvedTakers = new address[](0);

// Restrict to specific addresses
address[] memory approvedTakers = new address[](2);
approvedTakers[0] = address(0x123...);
approvedTakers[1] = address(0x456...);
```

## Contract Setup

First, deploy the required contracts:

```solidity
// Deploy NFT contracts
ParlayNFT makerNFT = new ParlayNFT("Parlay Maker", "PMKR");
ParlayNFT takerNFT = new ParlayNFT("Parlay Taker", "PTKR");

// Deploy ParlayPool
ParlayPool pool = new ParlayPool(
    collateralToken,
    address(makerNFT),
    address(takerNFT),
    maxParlayMarkets,
    minCollateral,
    minRequestExpirationTime,
    maxRequestExpirationTime,
    approvedTakers // List of approved takers (empty array = anyone can fill)
);

// Transfer ownership of NFT contracts to ParlayPool
makerNFT.transferOwnership(address(pool));
takerNFT.transferOwnership(address(pool));
```

## Example Scenario: Ana's Parlay Order

### Initial Setup

**Ana** wants to bet on a parlay with the following markets:
- Market 1: "Will Bitcoin reach $200k by end of year?" (YES)
- Market 2: "Will Ethereum reach $20k by end of year?" (YES)

**Bob** and **Carl** are takers who want to provide liquidity and compete for Ana's order.

### Step 1: Takers Prepare for Competition

Takers need to have sufficient balance and approve the pool to spend their tokens:

```solidity
// Bob approves the pool to spend his USDC (he'll need this when filling orders)
IERC20(collateralToken).approve(address(pool), 10000e6);

// Carl approves the pool to spend his USDC
IERC20(collateralToken).approve(address(pool), 8000e6);

// Note: No pre-deposits needed! Takers transfer funds directly when filling orders
// The pool checks their actual token balance at fill time
```

### Step 2: Ana Submits Parlay Order

Ana submits her parlay order with 1,000 USDC collateral:

```solidity
// Ana approves the pool to spend her USDC
IERC20(collateralToken).approve(address(pool), 1000e6);

// Ana creates the predicted outcomes array
IParlayStructs.PredictedOutcome[] memory predictedOutcomes = new IParlayStructs.PredictedOutcome[](2);

// Market 1: Bitcoin market
predictedOutcomes[0] = IParlayStructs.PredictedOutcome({
    market: IParlayStructs.Market({
        marketGroup: marketGroup1, // Bitcoin market group address
        marketId: 1               // Specific market ID
    }),
    prediction: true // YES for Bitcoin
});

// Market 2: Ethereum market
predictedOutcomes[1] = IParlayStructs.PredictedOutcome({
    market: IParlayStructs.Market({
        marketGroup: marketGroup2, // Ethereum market group address
        marketId: 2               // Specific market ID
    }),
    prediction: true // YES for Ethereum
});

// Ana submits parlay order
uint256 requestId = pool.submitParlayOrder(
    predictedOutcomes,
    1000e6,                    // 1,000 USDC collateral
    1200e6,                    // Expected 1,200 USDC payout
    block.timestamp + 60       // Order expires in 60 seconds
);

console.log("Parlay order submitted with ID:", requestId);
// Output: Parlay order submitted with ID: 1
```

**Event Emitted:**
```
ParlayOrderSubmitted(
    maker: ana,
    requestId: 1,
    predictedOutcomes: [Bitcoin(YES), Ethereum(YES)],
    collateral: 1000000000,
    payout: 1200000000,
    orderExpirationTime: 1703123456
)
```

### Step 3: Takers Compete by Filling the Order

Bob and Carl now compete by directly filling the order. The first one to fill within 60 seconds wins:

```solidity
// Bob tries to fill the order
pool.fillParlayOrder(1);

// If Bob's transaction goes through first, he wins!
// If Carl's transaction goes through first, Carl wins!

// Carl tries to fill the order
pool.fillParlayOrder(1);

// Only one of these transactions will succeed - the first one to be mined
```

**Event Emitted (for the winner):**
```
ParlayOrderFilled(
    requestId: 1,
    maker: ana,
    taker: bob, // or carl, depending on who filled first
    makerNftTokenId: 1,
    takerNftTokenId: 2,
    collateral: 1000000000,
    delta: 200000000, // 200 USDC delta provided by taker
    payout: 1200000000
)
```

### Step 4: Order is Filled (First Taker Wins)

The first taker to successfully fill the order within 60 seconds wins. Let's say Bob's transaction was mined first:

```solidity
// Check if order can be filled
(bool canFill, uint256 reason) = pool.canFillParlayOrder(1);
console.log("Can fill order:", canFill);
console.log("Reason code:", reason);
// Output: Can fill order: false (after being filled)
// Output: Reason code: 2 (Order already filled)

// Get parlay data
(IParlayStructs.ParlayData memory parlayData, IParlayStructs.PredictedOutcome[] memory predictedOutcomes) = pool.getParlayById(1);

console.log("Order filled by:", parlayData.taker);
console.log("Maker NFT ID:", parlayData.makerNftTokenId);
console.log("Taker NFT ID:", parlayData.takerNftTokenId);
console.log("Collateral:", parlayData.collateral);
console.log("Payout:", parlayData.payout);
// Output: Order filled by: bob
// Output: Maker NFT ID: 1
// Output: Taker NFT ID: 2
// Output: Collateral: 1000000000
// Output: Payout: 1200000000
```

**What happens:**
- Ana's 1,000 USDC collateral is locked in the contract
- Bob's 200 USDC delta is transferred from Bob to the contract
- Maker NFT #1 is minted to Ana
- Taker NFT #2 is minted to Bob
- The parlay ID is the same as the request ID (1)

### Step 5: Market Resolution and Settlement

After the markets resolve, the parlay can be settled, but only after 30 days from creation:

```solidity
// Check if parlay can be settled (must be 30 days after creation)
uint256 timeSinceCreation = block.timestamp - parlayData.createdAt;
console.log("Days since creation:", timeSinceCreation / 86400);
// Output: Days since creation: 25 (not ready yet)

// Wait for 30 days to pass...
// block.timestamp >= parlayData.createdAt + 30 days

// Now someone can call settleParlay (could be anyone)
pool.settleParlay(1); // Using maker NFT token ID

// Check if parlay is settled
(IParlayStructs.ParlayData memory settledParlay, ) = pool.getParlay(1);
console.log("Parlay settled:", settledParlay.settled);
console.log("Maker won:", settledParlay.makerWon);
// Output: Parlay settled: true
// Output: Maker won: true (assuming Ana's predictions were correct)
```

**Event Emitted:**
```
ParlaySettled(
    makerNftTokenId: 1,
    takerNftTokenId: 2,
    payout: 1200000000, // 1,000 + 200 USDC
    makerWon: true
)
```

### Step 6: Winner Withdraws Winnings

Since Ana won (all predictions were correct), she can withdraw her collateral + payout:

```solidity
// Ana withdraws her winnings using her maker NFT
pool.withdrawParlayCollateral(1);

console.log("Ana's USDC balance after withdrawal:", IERC20(collateralToken).balanceOf(ana));
// Output: Ana's USDC balance after withdrawal: 1200000000 (1,200 USDC)
```

**Event Emitted:**
```
ParlayCollateralWithdrawn(
    nftTokenId: 1,
    owner: ana,
    amount: 1200000000
)
```

## Alternative Scenario: Taker Wins

If Ana's predictions were wrong, Bob (the taker) would win:

```solidity
// In settleParlay function, if makerWon = false:
// The taker wins and gets the full payout

// Bob withdraws his winnings using his taker NFT
pool.withdrawParlayCollateral(2); // Using taker NFT token ID

console.log("Bob's USDC balance after withdrawal:", IERC20(collateralToken).balanceOf(bob));
// Output: Bob's USDC balance after withdrawal: 1200000000 (1,200 USDC)
```

## Order Expiration Example

If no taker fills Ana's order before expiration:

```solidity
// Wait for order to expire
// block.timestamp >= request.orderExpirationTime

// Ana cancels her expired order
pool.cancelExpiredOrder(1);

// Ana's collateral is returned to her
console.log("Ana's balance after canceling expired order:", IERC20(collateralToken).balanceOf(ana));
// Output: Ana's balance after canceling expired order: 1000000000 (1,000 USDC)
```

**Event Emitted:**
```
OrderExpired(
    requestId: 1,
    maker: ana,
    collateralReturned: 1000000000
)
```

## Parlay Expiration Example

If a parlay is not settled within 30 days, it can be swept:

```solidity
// Wait for parlay to expire (30 days after creation)
// block.timestamp >= parlay.createdAt + 30 days

// Anyone can sweep the expired parlay
pool.sweepExpiredParlay(1);

// NFTs are burned and collateral remains in the pool
console.log("Maker NFT exists:", makerNFT.ownerOf(1));
// Output: Maker NFT exists: Revert (token does not exist)
```

**Event Emitted:**
```
ParlayExpired(
    makerNftTokenId: 1,
    takerNftTokenId: 2,
    collateralReclaimed: 1000000000
)
```

## Key Features Summary

### For Makers (like Ana):
- ✅ Submit parlay orders with collateral
- ✅ Set expected payout amount
- ✅ Get filled by best available taker
- ✅ Withdraw winnings if predictions correct
- ✅ Cancel expired orders and recover collateral

### For Takers (like Bob and Carl):
- ✅ Approve token spending to participate
- ✅ Compete by directly filling orders
- ✅ First to fill within time limit wins
- ✅ Transfer delta directly when filling
- ✅ No deposit/withdrawal management needed
- ✅ Withdraw winnings if maker loses

### Competition Mechanism:
- ✅ Takers compete by calling fillParlayOrder directly
- ✅ First transaction to be mined wins
- ✅ No pre-deposits required
- ✅ Winner is determined by transaction order

### Delta-Based System:
- ✅ Takers only provide the profit amount (delta)
- ✅ Delta = payout - collateral
- ✅ More efficient capital usage
- ✅ Clear risk/reward structure

### Settlement Timeline:
- ✅ Parlays can only be settled after 30 days from creation
- ✅ Markets must be settled before parlay settlement
- ✅ Only Yes/No markets are supported
- ✅ Winner takes full payout amount

### Security Features:
- ✅ Reentrancy protection
- ✅ Proper balance tracking
- ✅ NFT-based ownership verification
- ✅ Expiration handling
- ✅ Safe token transfers
- ✅ Market validation (Yes/No markets only)

This orderbook-style system ensures fair competition among takers while providing makers with the best possible payouts for their parlays. The 30-day settlement requirement ensures markets have time to resolve before any payouts are distributed. 