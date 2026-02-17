# PredictionMarket Contract Usage Examples

This document explains how to use the PredictionMarket contract with practical examples featuring three users: **Ana** (maker), **Bob** and **Carl** (takers).

## Overview

The PredictionMarket implements a comprehensive prediction system with two main approaches:

### 1. Direct RFQ (Request-for-Quote) System
- **Makers** and **Takers** agree off-chain on prediction terms
- **Taker** creates an EIP-712 signature approving the specific prediction
- **Maker** calls `mint()` with both parties' details and the taker's signature
- Both parties must have approved the contract to spend their collateral tokens
- The contract validates the taker's signature and transfers both parties' collateral
- After market resolution, anyone can call `burn()` to settle and send winnings to the winner
- Predictions can only be settled after markets are resolved

### 2. Limit Order System
- **Makers** can place limit orders using `placeOrder()` to set up predictions with specific terms
- **Takers** can browse and fill available orders using `fillOrder()` when they match their criteria
- Orders have expiration deadlines and can be cancelled by makers using `cancelOrder()` at any time
- Once filled, limit orders automatically create predictions that can be settled via `burn()`
- This provides more flexibility and control over prediction timing and terms
- No signatures required for limit orders - just token approvals



## Contract Setup

First, deploy the required contracts:

```solidity
// Deploy the PredictionMarket
PredictionMarket market = new PredictionMarket(
    "Prediction Market NFT",  // name
    "PMKT",                    // symbol
    collateralToken,           // address of collateral token (e.g., USDC)
    minCollateral              // minimum collateral amount (e.g., 1e6 for 1 USDC)
);

// Deploy the resolver
PredictionMarketSapienceResolver resolver = new PredictionMarketSapienceResolver(address(market));
```

## Token Approval and Taker Signature Creation

Before creating predictions, both makers and takers need to prepare:

1. **ERC20 Token Approval**: Approve the PredictionMarket contract to spend their collateral tokens
2. **Taker Prediction Signature**: The taker must create an EIP-712 signature approving the specific prediction

### Step 1: Token Approvals

Both maker and taker must approve the contract to transfer their collateral:

```solidity
// Ana (maker) approves the contract to spend her USDC
IERC20(collateralToken).approve(address(market), 1000e6); // 1,000 USDC

// Bob (taker) approves the contract to spend his USDC
IERC20(collateralToken).approve(address(market), 200e6); // 200 USDC
```

### Step 2: Creating the Taker Prediction Signature

The taker must sign an approval for the specific prediction using EIP-712. This signature includes:
- The encoded predicted outcomes
- The taker and maker collateral amounts
- The resolver address
- The maker's address
- The taker's deadline
- The maker's nonce (for replay protection)

```solidity
// Create the message hash for the taker to sign
bytes32 messageHash = keccak256(
    abi.encode(
        encodedPredictedOutcomes,
        takerCollateral,      // 200e6
        makerCollateral,      // 1000e6
        resolver,             // address(resolver)
        maker,                // ana
        takerDeadline,        // block.timestamp + 3600
        makerNonce            // current nonce for ana
    )
);

// Bob creates the EIP-712 signature (off-chain)
// This would be done using the SignatureProcessor's getApprovalHash function
bytes32 approvalHash = market.getApprovalHash(messageHash, bob);

// Bob signs this hash off-chain with his private key
// The signature proves Bob approves this specific prediction
bytes memory bobSignature = signHash(approvalHash, bobPrivateKey);
```

### Maker Nonce Management

Each maker has a sequential nonce that prevents signature replay:

```solidity
// Get Ana's current nonce
uint256 anaNonce = market.nonces(ana);
console.log("Ana's current nonce:", anaNonce);

// This nonce must be used in the taker signature
// After mint() is called, Ana's nonce will increment to anaNonce + 1
```

### Important Notes

- **Token Approvals**: Must be done before calling mint()
- **Taker Signature**: The taker must sign off-chain approving the exact prediction terms
- **Nonce Protection**: Each maker nonce can only be used once
- **Predetermined Taker**: The taker must be known and willing before mint() is called
- **No Competition**: Unlike some prediction markets, there's no competition between takers

## Example Scenario: Ana's Prediction with Bob

### Initial Setup

**Ana** wants to bet on a prediction with the following markets:
- Market 1: "Will Bitcoin reach $200k by end of year?" (YES)
- Market 2: "Will Ethereum reach $20k by end of year?" (YES)

**Ana** and **Bob** agree off-chain that Bob will be the taker for this prediction.

### Step 1: Both Parties Approve Token Spending

Both Ana and Bob must approve the contract to spend their collateral:

```solidity
// Ana approves the contract to spend her USDC (maker collateral)
IERC20(collateralToken).approve(address(market), 1000e6); // 1,000 USDC

// Bob approves the contract to spend his USDC (taker collateral)
IERC20(collateralToken).approve(address(market), 200e6); // 200 USDC
```

### Step 2: Encode the Prediction Outcomes

The prediction outcomes must be encoded by the resolver:

```solidity
// The resolver encodes the prediction outcomes into bytes
bytes memory encodedPredictionOutcomes = resolver.encodePredictionOutcomes(
    marketGroup1, // Bitcoin market group address
    1,            // Bitcoin market ID
    true,         // YES for Bitcoin
    marketGroup2, // Ethereum market group address
    2,            // Ethereum market ID
    true          // YES for Ethereum
);
```

### Step 3: Bob Creates His Signature

Bob must sign an EIP-712 approval for this specific prediction:

```solidity
// Get Ana's current nonce
uint256 anaNonce = market.nonces(ana);

// Create the message hash
bytes32 messageHash = keccak256(
    abi.encode(
        encodedPredictedOutcomes,
        200e6,            // taker collateral
        1000e6,           // maker collateral
        address(resolver),
        ana,              // maker
        block.timestamp + 3600, // taker deadline (1 hour from now)
        anaNonce
    )
);

// Bob gets the approval hash to sign
bytes32 approvalHash = market.getApprovalHash(messageHash, bob);

// Bob signs this hash off-chain (using his wallet/private key)
bytes memory bobSignature = signHash(approvalHash, bobPrivateKey);
```

### Step 4: Ana Calls mint() to Create the Prediction

Ana calls the mint function with all the prediction data and Bob's signature:

```solidity
// Ana creates the prediction by calling mint()
(uint256 makerNftTokenId, uint256 takerNftTokenId) = market.mint(
    IPredictionStructs.MintPredictionRequestData({
        encodedPredictedOutcomes: encodedPredictionOutcomes,
        resolver: address(resolver),
        makerCollateral: 1000e6,           // 1,000 USDC
        takerCollateral: 200e6,            // 200 USDC
        maker: ana,
        taker: bob,
        makerNonce: anaNonce,
        takerSignature: bobSignature,
        takerDeadline: block.timestamp + 3600,
        refCode: bytes32(0)
    })
);

console.log("Prediction created! Maker NFT ID:", makerNftTokenId);
console.log("Taker NFT ID:", takerNftTokenId);
// Output: Prediction created! Maker NFT ID: 1
// Output: Taker NFT ID: 2
```

**What happens during mint:**
- The contract validates that the taker (Bob) signed approval for this exact prediction
- The contract checks that the maker nonce is correct and increments it
- Ana's 1,000 USDC collateral is transferred to the contract
- Bob's 200 USDC collateral is transferred to the contract
- Two NFTs are minted: one for Ana (maker) and one for Bob (taker)
- The prediction is stored and is now active

### Step 5: Check Prediction Status

After the prediction is created, you can query its details:

```solidity
// Get prediction data using either NFT token ID
IPredictionStructs.PredictionData memory predictionData = market.getPrediction(makerNftTokenId);

console.log("Maker:", predictionData.maker);
console.log("Taker:", predictionData.taker);
console.log("Maker NFT ID:", predictionData.makerNftTokenId);
console.log("Taker NFT ID:", predictionData.takerNftTokenId);
console.log("Maker Collateral:", predictionData.makerCollateral);
console.log("Taker Collateral:", predictionData.takerCollateral);
console.log("Total Payout:", predictionData.makerCollateral + predictionData.takerCollateral);
console.log("Settled:", predictionData.settled);
// Output: Maker: ana
// Output: Taker: bob
// Output: Maker NFT ID: 1
// Output: Taker NFT ID: 2
// Output: Maker Collateral: 1000000000
// Output: Taker Collateral: 200000000
// Output: Total Payout: 1200000000
// Output: Settled: false
```

### Step 6: Market Resolution and Settlement

After the markets resolve, the prediction can be settled by calling `burn()`:

```solidity
// Wait for markets to resolve...
// The resolver checks if all markets are settled

// Anyone can call burn to settle the prediction
market.burn(makerNftTokenId, bytes32(0)); // Using maker NFT token ID and ref code

// Check if prediction is settled
IPredictionStructs.PredictionData memory settledPrediction = market.getPrediction(makerNftTokenId);
console.log("Prediction settled:", settledPrediction.settled);
console.log("Maker won:", settledPrediction.makerWon);
// Output: Prediction settled: true
// Output: Maker won: true (assuming Ana's predictions were correct)
```

**What happens during burn:**
- The resolver determines the outcome of all markets
- If Ana's predictions were correct, she wins (makerWon = true)
- If Ana's predictions were wrong, Bob (the taker) wins (makerWon = false)
- The winning party receives the full payout (1,200 USDC)
- Both NFTs are burned

### Step 7: Winner Receives Winnings

Since Ana won (all predictions were correct), she receives the full payout:

```solidity
// Ana's winnings are automatically transferred when burn() is called
// The NFTs are burned and the payout is sent to her address

console.log("Ana's USDC balance after settlement:", IERC20(collateralToken).balanceOf(ana));
// Output: Ana's USDC balance after settlement: 1200000000 (1,200 USDC)
```

## Alternative Scenario: Taker Wins

If Ana's predictions were wrong, Bob (the taker) would win:

```solidity
// Anyone can call burn (doesn't have to be the winner)
market.burn(takerNftTokenId, bytes32(0));

// Bob's winnings are automatically transferred when burn() is called
// The NFTs are burned and the payout is sent to his address

console.log("Bob's USDC balance after settlement:", IERC20(collateralToken).balanceOf(bob));
// Output: Bob's USDC balance after settlement: 1200000000 (1,200 USDC)
```

## Consolidation for Self-Trading

If Ana wants to trade against herself (useful for testing or closing positions):

```solidity
// This only works if Ana owns BOTH the maker and taker NFTs
// (e.g., she bought Bob's position or created it with herself as taker)
market.consolidatePrediction(makerNftTokenId, bytes32(0));

// This immediately settles the prediction with Ana as the winner
// Both NFTs are burned and Ana receives the full payout
```

## Limit Order System

The PredictionMarket contract now supports limit orders, providing makers with more control over their prediction terms and timing. This system allows makers to place orders that takers can fill at their convenience.

### How Limit Orders Work

1. **Maker places an order** using `placeOrder()` with specific terms
2. **Takers browse available orders** and fill them using `fillOrder()`
3. **Orders expire** after the specified deadline and can be cancelled by makers at any time
4. **When filled**, orders automatically create predictions that work the same as direct mint predictions

### Step 1: Ana Places a Limit Order

Ana wants to place a limit order for her Bitcoin and Ethereum prediction:

```solidity
// Ana prepares her prediction data (same as before)
bytes memory encodedPredictionOutcomes = resolver.encodePredictionOutcomes(
    marketGroup1, // Bitcoin market group address
    1,            // Bitcoin market ID
    true,         // YES for Bitcoin
    marketGroup2, // Ethereum market group address
    2,            // Ethereum market ID
    true          // YES for Ethereum
);

// Ana places a limit order
uint256 orderId = market.placeOrder(
    IPredictionStructs.OrderRequestData({
        encodedPredictedOutcomes: encodedPredictionOutcomes,
        orderDeadline: block.timestamp + 86400, // 24 hours from now
        resolver: address(resolver),
        makerCollateral: 1000e6,    // 1,000 USDC collateral
        takerCollateral: 200e6,     // 200 USDC delta from taker
        maker: ana,                 // Ana's address
        refCode: bytes32(0)         // Reference code
    })
);

console.log("Order placed with ID:", orderId);
// Output: Order placed with ID: 1
```

**What happens during placeOrder:**
- Ana's 1,000 USDC collateral is transferred to the contract
- The order is stored with a unique order ID
- The order is added to the unfilled orders list
- An `OrderPlaced` event is emitted

### Step 2: Bob and Carl Browse Available Orders

Takers can now browse available orders:

```solidity
// Get all unfilled order IDs
uint256[] memory unfilledOrderIds = market.getUnfilledOrderIds();
console.log("Total unfilled orders:", unfilledOrderIds.length);
// Output: Total unfilled orders: 1

// Get details of a specific order
IPredictionStructs.LimitOrderData memory order = market.getUnfilledOrder(orderId);
console.log("Order maker:", order.maker);
console.log("Order deadline:", order.orderDeadline);
console.log("Maker collateral:", order.makerCollateral);
console.log("Taker collateral:", order.takerCollateral);
// Output: Order maker: ana
// Output: Order deadline: 1703123456
// Output: Maker collateral: 1000000000
// Output: Taker collateral: 200000000

// Check if the order is still valid (not expired)
bool isOrderValid = block.timestamp < order.orderDeadline;
console.log("Order is valid:", isOrderValid);
// Output: Order is valid: true
```

### Step 3: Bob Fills the Order

Bob decides to fill Ana's order:

```solidity
// Bob fills the order
market.fillOrder(orderId, bytes32(0)); // Using order ID and ref code

// Check if the order was filled
IPredictionStructs.LimitOrderData memory filledOrder = market.getUnfilledOrder(orderId);
console.log("Order still exists:", filledOrder.orderId != 0);
// Output: Order still exists: false (order was filled)
```

**What happens during fillOrder:**
- Bob's 200 USDC collateral is transferred to the contract
- A prediction is automatically created using the order terms
- The order is marked as filled (orderId set to 0)
- An `OrderFilled` event is emitted
- Two NFTs are minted (one for Ana, one for Bob)

### Step 4: Check the Created Prediction

After filling, we can check the prediction that was created:

```solidity
// The prediction was created with NFT IDs from the order
// We can get prediction data using either NFT ID
IPredictionStructs.PredictionData memory prediction = market.getPrediction(anaNftTokenId);

console.log("Prediction maker:", prediction.maker);
console.log("Prediction taker:", prediction.taker);
console.log("Maker NFT ID:", prediction.makerNftTokenId);
console.log("Taker NFT ID:", prediction.takerNftTokenId);
console.log("Maker Collateral:", prediction.makerCollateral);
console.log("Taker Collateral:", prediction.takerCollateral);
// Output: Prediction maker: ana
// Output: Prediction taker: bob
// Output: Maker NFT ID: 3
// Output: Taker NFT ID: 4
// Output: Maker Collateral: 1000000000
// Output: Taker Collateral: 200000000
```

### Step 5: Order Cancellation (Alternative Scenario)

If Ana wants to cancel her order before it's filled:

```solidity
// Ana can cancel her order at any time (before or after expiration)
// No need to wait for the deadline to pass
market.cancelOrder(orderId);

// Check if the order was cancelled
IPredictionStructs.LimitOrderData memory cancelledOrder = market.getUnfilledOrder(orderId);
console.log("Order still exists:", cancelledOrder.orderId != 0);
// Output: Order still exists: false (order was cancelled)

// Ana's collateral is automatically returned
console.log("Ana's USDC balance after cancellation:", IERC20(collateralToken).balanceOf(ana));
// Output: Ana's USDC balance after cancellation: 1000000000 (1,000 USDC returned)
```

**What happens during cancelOrder:**
- Ana's collateral is returned to her
- The order is marked as cancelled (orderId set to 0)
- The order is removed from unfilled orders lists
- An `OrderCancelled` event is emitted

### Step 6: Settlement (Same as Direct Mint)

Once the prediction is created from a filled order, settlement works exactly the same:

```solidity
// After markets resolve, anyone can call burn to settle
market.burn(anaNftTokenId); // Using maker NFT token ID

// Check settlement results
IPredictionStructs.PredictionData memory settledPrediction = market.getPrediction(anaNftTokenId);
console.log("Prediction settled:", settledPrediction.settled);
console.log("Maker won:", settledPrediction.makerWon);
// Output: Prediction settled: true
// Output: Maker won: true (assuming Ana's predictions were correct)
```

### Limit Order Query Functions

The contract provides several functions to query limit orders:

```solidity
// Get total count of unfilled orders
uint256 totalOrders = market.getUnfilledOrdersCount();
console.log("Total unfilled orders:", totalOrders);

// Get all unfilled order IDs
uint256[] memory allOrderIds = market.getUnfilledOrderIds();

// Get orders placed by a specific maker
uint256[] memory anaOrders = market.getUnfilledOrderByMaker(ana);
console.log("Ana's unfilled orders:", anaOrders.length);

// Get details of a specific order
IPredictionStructs.LimitOrderData memory orderDetails = market.getUnfilledOrder(orderId);
```

### Limit Order Events

The system emits three main events for limit orders:

```solidity
// When an order is placed
event OrderPlaced(
    address indexed maker,
    uint256 indexed orderId,
    bytes encodedPredictedOutcomes,
    address resolver,
    uint256 makerCollateral,
    uint256 takerCollateral,
    bytes32 refCode
);

// When an order is filled
event OrderFilled(
    uint256 indexed orderId,
    address indexed maker,
    address indexed taker,
    bytes encodedPredictedOutcomes,
    uint256 makerCollateral,
    uint256 takerCollateral,
    bytes32 refCode
);

// When an order is cancelled
event OrderCancelled(
    uint256 indexed orderId,
    address indexed maker,
    bytes encodedPredictedOutcomes,
    uint256 makerCollateral,
    uint256 takerCollateral
);
```

## Key Features Summary

### For Makers (like Ana):
- ✅ **Direct RFQ**: Create predictions by calling `mint()` with taker's signature
- ✅ **Limit Orders**: Place orders using `placeOrder()` for flexible timing
- ✅ Set the prediction outcomes and collateral amounts
- ✅ Agree off-chain with a specific taker (RFQ) or let anyone fill (limit orders)
- ✅ Receive winnings if predictions are correct
- ✅ Cancel unfilled limit orders at any time
- ✅ Transfer prediction NFTs to other parties

### For Takers (like Bob):
- ✅ **Direct RFQ**: Sign approval for specific predictions off-chain
- ✅ **Order Filling**: Browse and fill limit orders using `fillOrder()`
- ✅ No signatures needed for limit orders, just token approval
- ✅ Provide collateral when maker calls mint() (RFQ) or when filling orders
- ✅ Receive winnings if maker's predictions are wrong
- ✅ Transfer prediction NFTs to other parties

### Two Trading Approaches:
- ✅ **Direct RFQ (Request-for-Quote)**: Off-chain agreement, on-chain execution with signature
- ✅ **Limit Orders**: On-chain orderbook with flexible timing
- ✅ **Burn**: Settle prediction and distribute winnings (both approaches)
- ✅ **Consolidate**: Self-trade option when owning both NFTs

### Limit Order System:
- ✅ **Place Orders**: Set specific terms with expiration deadlines
- ✅ **Fill Orders**: Browse available orders and fill when ready
- ✅ **Cancel Orders**: Cancel unfilled orders at any time
- ✅ **Query Orders**: Get order details, counts, and maker-specific orders
- ✅ **Automatic Prediction Creation**: Filled orders create standard predictions

### Signature System (RFQ Only):
- ✅ **ERC20 Approvals**: Standard approve/transferFrom pattern
- ✅ **Taker EIP-712 Signature**: Ensures taker approves the specific prediction
- ✅ **Nonce Protection**: Each maker has sequential nonce to prevent replay
- ✅ **Automatic Validation**: Resolver validates markets and outcomes

### Security Features:
- ✅ Reentrancy protection
- ✅ Proper balance tracking with fee-on-transfer protection
- ✅ NFT-based ownership verification
- ✅ Market validation through resolver
- ✅ Safe token transfers with balance checks
- ✅ Signature validation for RFQ predictions
- ✅ Order expiration and flexible cancellation
- ✅ Prevents transfers to PassiveLiquidityVault contracts

## Choosing Between Direct RFQ and Limit Orders

Both approaches create the same final predictions, but they serve different use cases:

### Use Direct RFQ When:
- ✅ **Immediate execution** is desired
- ✅ **Specific counterparty** is already identified
- ✅ You want to **react quickly** to market conditions
- ✅ **Off-chain negotiation** has already occurred
- ✅ You have **taker's signature** ready
- ✅ You want **privacy** (no public orderbook)

### Use Limit Orders When:
- ✅ **Flexible timing** is needed
- ✅ You want to **set specific terms** and wait for any taker
- ✅ **Public orderbook** visibility is desired
- ✅ You want to **cancel orders** if conditions change
- ✅ **Browsing and selection** of orders is desired
- ✅ You don't have a specific counterparty yet

### Comparison Summary:

| Feature | Direct RFQ | Limit Orders |
|---------|-------------|--------------|
| **Execution** | Immediate | On-demand |
| **Counterparty** | Predetermined | Any taker |
| **Timing** | Real-time | Flexible |
| **Cancellation** | Not applicable | At any time |
| **Gas Cost** | Lower (single tx) | Higher (two txs) |
| **Signatures** | Taker EIP-712 required | None required |
| **Privacy** | Private negotiation | Public orderbook |
| **Order Management** | None needed | Full order lifecycle |

## Resolver Integration

The `PredictionMarketSapienceResolver` is crucial for the system:

```solidity
// Deploy the resolver
PredictionMarketSapienceResolver resolver = new PredictionMarketSapienceResolver(address(market));

// The resolver provides:
// 1. Market validation (Yes/No markets only, not settled)
// 2. Outcome resolution (determines winner)
// 3. Market compatibility checks
// 4. Prediction outcome encoding (converts market data to bytes)

// During mint() or placeOrder():
// - Validates all markets are valid Yes/No markets
// - Ensures markets are not already settled
// - Checks market compatibility

// During burn():
// - Decodes the stored prediction outcomes
// - Verifies all markets are settled
// - Determines the outcome of each market
// - Calculates whether the maker won or lost
```

## Summary

This comprehensive system provides both immediate execution (direct RFQ) and flexible order management (limit orders) for prediction markets. The dual approach accommodates different trading preferences:

- **Direct RFQ** offers streamlined, immediate prediction creation with off-chain agreement and on-chain execution
- **Limit Orders** provide flexible timing, public orderbook, and order management capabilities
- Both approaches use the same **resolver validation** and **settlement mechanisms**
- The **NFT-based system** ensures clear ownership, transferability, and easy tracking of predictions
- The **EIP-712 signature system** (RFQ only) provides security without requiring on-chain orderbook for private trades

The resolver ensures proper market validation and outcome determination for both trading approaches, making the system robust and user-friendly regardless of your preferred trading style. 