# PredictionMarket Contract Usage Examples

This document explains how to use the PredictionMarket contract with practical examples featuring three users: **Ana** (maker), **Bob** and **Carl** (takers).

## Overview

The PredictionMarket implements a comprehensive prediction system with two main approaches:

### 1. Direct Mint/Burn System
- **Makers** create predictions by calling `mint()` with their collateral and desired outcomes
- **Takers** compete by calling `mint()` with the same prediction data and their delta amount
- The **first taker to mint** within the time limit wins the opportunity
- Takers only provide the delta (profit amount), not the full payout
- After market resolution, the **winner** (maker or taker) calls `burn()` to settle and withdraw winnings
- Predictions can only be settled after markets are resolved

### 2. Limit Order System
- **Makers** can place limit orders using `placeOrder()` to set up predictions with specific terms
- **Takers** can browse and fill available orders using `fillOrder()` when they match their criteria
- Orders have expiration deadlines and can be cancelled by makers using `cancelOrder()`
- Once filled, limit orders automatically create predictions that can be settled via `burn()`
- This provides more flexibility and control over prediction timing and terms



## Contract Setup

First, deploy the required contracts:

```solidity
// Deploy the PredictionMarket
PredictionMarket market = new PredictionMarket(
    "Prediction Market NFT",
    "PMKT",
    collateralToken,
    maxPredictionMarkets,
    minCollateral,
    minRequestExpirationTime,
    maxRequestExpirationTime
);

// Deploy the resolver
PredictionMarketSapienceResolver resolver = new PredictionMarketSapienceResolver(address(market));
```

## ERC20 Permit Signature Creation

Before creating predictions, both makers and takers need to create ERC20 permit signatures. These signatures allow the contract to transfer tokens without requiring separate approval transactions.

### Creating the Permit Signature

The permit signature is created using the EIP-712 standard with the following parameters:

```solidity
// The permit function signature for ERC20 tokens
bytes32 public constant PERMIT_TYPEHASH = keccak256(
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
);

// Example: Ana wants to permit the market to spend 1000 USDC
function createPermitSignature(
    address owner,           // Ana's address
    address spender,         // PredictionMarket contract address
    uint256 value,           // 1000e6 (1000 USDC)
    uint256 nonce,           // Current nonce from the token contract
    uint256 deadline,        // Block timestamp + 60 seconds
    uint256 privateKey       // Ana's private key (off-chain)
) external pure returns (bytes memory signature) {
    // Create the struct hash
    bytes32 structHash = keccak256(
        abi.encode(
            PERMIT_TYPEHASH,
            owner,
            spender,
            value,
            nonce,
            deadline
        )
    );
    
    // Create the domain separator
    bytes32 DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("USDC")),           // Token name
            keccak256(bytes("1")),              // Version
            1,                                  // Chain ID (mainnet)
            address(0xA0b86a33E6441b8c4C8C0C0C0C0C0C0C0C0C0C0) // USDC contract address
        )
    );
    
    // Create the final hash
    bytes32 hash = keccak256(
        abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
    );
    
    // Sign the hash with the private key (this would be done off-chain)
    // For demonstration purposes, we're showing the structure
    // In practice, this would be done using a wallet or signing library
    
    return signature;
}
```

### Getting the Current Nonce

Each user has a unique nonce that increases with each permit signature:

```solidity
// Get the current nonce for a user
uint256 currentNonce = IERC20Permit(collateralToken).nonces(ana);
console.log("Ana's current nonce:", currentNonce);

// The nonce should be used in the permit signature
// Each new permit signature must use the next nonce value
```

### Setting the Deadline

The deadline should be set to a reasonable time in the future:

```solidity
// Set deadline to 60 seconds from now
uint256 deadline = block.timestamp + 60;

// Make sure the deadline is not too far in the future
require(deadline <= block.timestamp + 3600, "Deadline too far in future");
```

### Complete Permit Flow

Here's how the complete permit flow works:

```solidity
// 1. Ana gets her current nonce
uint256 anaNonce = IERC20Permit(collateralToken).nonces(ana);

// 2. Ana creates the permit signature (off-chain)
bytes memory anaPermitSignature = createPermitSignature(
    ana,                                    // owner
    address(market),                        // spender (PredictionMarket)
    1000e6,                                 // value (1000 USDC)
    anaNonce,                               // current nonce
    block.timestamp + 60,                   // deadline
    anaPrivateKey                           // Ana's private key
);

// 3. Bob gets his current nonce
uint256 bobNonce = IERC20Permit(collateralToken).nonces(bob);

// 4. Bob creates the permit signature (off-chain)
bytes memory bobPermitSignature = createPermitSignature(
    bob,                                    // owner
    address(market),                        // spender (PredictionMarket)
    200e6,                                  // value (200 USDC)
    bobNonce,                               // current nonce
    block.timestamp + 60,                   // deadline
    bobPrivateKey                           // Bob's private key
);

// 5. Both signatures are used in the mint() call
market.mint(
    encodedPredictionOutcomes,
    address(resolver),
    1000e6,                    // maker collateral
    200e6,                     // taker collateral
    ana,                       // maker
    bob,                       // taker
    anaPermitSignature,        // Ana's permit signature
    bobPermitSignature,        // Bob's permit signature
    block.timestamp + 60,      // Ana's deadline
    block.timestamp + 60,      // Bob's deadline
    bobPredictionSignature,    // Bob's prediction approval
    bytes32(0)                 // ref code
);
```

### Important Notes

- **Nonce Management**: Each permit signature must use a unique, sequential nonce
- **Deadline**: Set reasonable deadlines to prevent signature replay attacks
- **Off-chain Signing**: Permit signatures are created off-chain using the user's private key
- **Gas Efficiency**: Permits eliminate the need for separate approval transactions
- **Security**: Only the contract address specified in the permit can spend the tokens

## Example Scenario: Ana's Prediction

### Initial Setup

**Ana** wants to bet on a prediction with the following markets:
- Market 1: "Will Bitcoin reach $200k by end of year?" (YES)
- Market 2: "Will Ethereum reach $20k by end of year?" (YES)

**Bob** and **Carl** are takers who want to provide liquidity and compete for Ana's prediction.

### Step 1: Takers Prepare for Competition

Takers need to have sufficient balance and prepare their signatures:

```solidity
// Bob and Carl need to have sufficient USDC balance
// They'll also need to create ERC20 permit signatures and prediction approval signatures
// These signatures will be used when they call mint()

// Note: No pre-approvals needed! Takers provide signatures directly when minting
```

### Step 2: Ana Creates the Prediction

Ana creates her prediction by calling `mint()` with her collateral:

```solidity
// Ana prepares her prediction data
// The resolver will encode the prediction outcomes into bytes
bytes memory encodedPredictionOutcomes = resolver.encodePredictionOutcomes(
    marketGroup1, // Bitcoin market group address
    1,            // Bitcoin market ID
    true,         // YES for Bitcoin
    marketGroup2, // Ethereum market group address
    2,            // Ethereum market ID
    true          // YES for Ethereum
);

// Ana creates the prediction by calling mint()
(uint256 makerNftTokenId, uint256 takerNftTokenId) = market.mint(
    encodedPredictionOutcomes,
    address(resolver),
    1000e6,                    // 1,000 USDC collateral
    200e6,                     // 200 USDC delta from taker
    ana,                       // Maker address
    address(0),                // Taker address (will be set when taker fills)
    makerSignature,            // ERC20 permit signature for Ana
    takerSignature,            // ERC20 permit signature for taker (placeholder)
    block.timestamp + 60,      // Maker signature deadline
    block.timestamp + 60,      // Taker signature deadline
    takerPredictionSignature,  // Taker's approval signature
    bytes32(0)                 // Ref code
);

console.log("Prediction created! Maker NFT ID:", makerNftTokenId);
console.log("Taker NFT ID:", takerNftTokenId);
// Output: Prediction created! Maker NFT ID: 1
// Output: Taker NFT ID: 2
```

**What happens during mint:**
- The resolver validates that all markets are valid Yes/No markets and not settled
- Ana's 1,000 USDC collateral is transferred to the contract using ERC20 permit
- Two NFTs are minted: one for the maker (Ana) and one for the taker
- The prediction is stored with the maker's data
- The taker NFT is held by the contract until a taker claims it

### Step 3: Takers Compete by Claiming the Taker NFT

Bob and Carl now compete by calling `mint()` with the same prediction data to claim the taker position:

```solidity
// Bob tries to claim the taker position
market.mint(
    encodedPredictionOutcomes,
    address(resolver),
    1000e6,                    // Maker collateral
    200e6,                     // Taker collateral (delta)
    ana,                       // Maker address
    bob,                       // Taker address
    makerSignature,            // Maker's ERC20 permit signature
    bobTakerSignature,         // Bob's ERC20 permit signature
    block.timestamp + 60,      // Maker signature deadline
    block.timestamp + 60,      // Taker signature deadline
    bobPredictionSignature,    // Bob's prediction approval signature
    bytes32(0)                 // Ref code
);

// If Bob's transaction goes through first, he wins the taker position!
// If Carl's transaction goes through first, Carl wins!

// Carl tries to claim the taker position
market.mint(
    encodedPredictionOutcomes,
    address(resolver),
    1000e6,                    // Maker collateral
    200e6,                     // Taker collateral (delta)
    ana,                       // Maker address
    carl,                      // Taker address
    makerSignature,            // Maker's ERC20 permit signature
    carlTakerSignature,        // Carl's ERC20 permit signature
    block.timestamp + 60,      // Maker signature deadline
    block.timestamp + 60,      // Taker signature deadline
    carlPredictionSignature,   // Carl's prediction approval signature
    bytes32(0)                 // Ref code
 );

// Only one of these transactions will succeed - the first one to be mined
```

**What happens when a taker wins:**
- The taker's 200 USDC delta is transferred to the contract using ERC20 permit
- The taker NFT is transferred from the contract to the winning taker
- The prediction is now fully funded and active

### Step 4: Check Prediction Status

After a taker successfully claims the position:

```solidity
// Get prediction data
(IPredictionStructs.PredictionData memory predictionData, IPredictionStructs.PredictedOutcome[] memory predictedOutcomes) = market.getPrediction(1);

console.log("Taker:", predictionData.taker);
console.log("Maker NFT ID:", predictionData.makerNftTokenId);
console.log("Taker NFT ID:", predictionData.takerNftTokenId);
console.log("Maker Collateral:", predictionData.makerCollateral);
console.log("Taker Collateral:", predictionData.takerCollateral);
console.log("Total Payout:", predictionData.makerCollateral + predictionData.takerCollateral);
console.log("Filled:", predictionData.filled);
// Output: Taker: bob (or carl, depending on who won)
// Output: Maker NFT ID: 1
// Output: Taker NFT ID: 2
// Output: Maker Collateral: 1000000000
// Output: Taker Collateral: 200000000
// Output: Total Payout: 1200000000
// Output: Filled: true
```

### Step 5: Market Resolution and Settlement

After the markets resolve, the prediction can be settled by calling `burn()`:

```solidity
// Wait for markets to resolve...
// The resolver checks if all markets are settled

// Now someone can call burn to settle the prediction (could be anyone)
market.burn(1); // Using maker NFT token ID

// Check if prediction is settled
(IPredictionStructs.PredictionData memory settledPrediction, ) = market.getPrediction(1);
console.log("Prediction settled:", settledPrediction.settled);
console.log("Maker won:", settledPrediction.makerWon);
// Output: Prediction settled: true
// Output: Maker won: true (assuming Ana's predictions were correct)
```

**What happens during burn:**
- The resolver determines the outcome of all markets
- If Ana's predictions were correct, she wins (makerWon = true)
- If Ana's predictions were wrong, the taker wins (makerWon = false)
- The winning party receives the full payout (1,200 USDC)
- Both NFTs are burned

### Step 6: Winner Receives Winnings

Since Ana won (all predictions were correct), she receives the full payout:

```solidity
// Ana's winnings are automatically transferred when burn() is called
// The NFT is burned and the payout is sent to her address

console.log("Ana's USDC balance after settlement:", IERC20(collateralToken).balanceOf(ana));
// Output: Ana's USDC balance after settlement: 1200000000 (1,200 USDC)
```

## Alternative Scenario: Taker Wins

If Ana's predictions were wrong, Bob (the taker) would win:

```solidity
// In burn function, if makerWon = false:
// The taker wins and gets the full payout

// Bob's winnings are automatically transferred when burn() is called
// The NFT is burned and the payout is sent to his address

console.log("Bob's USDC balance after settlement:", IERC20(collateralToken).balanceOf(bob));
// Output: Bob's USDC balance after settlement: 1200000000 (1,200 USDC)
```

## Consolidation for Self-Trading

If Ana wants to trade against herself (useful for testing or specific strategies):

```solidity
// Ana can consolidate her own prediction
market.consolidatePrediction(1);

// This immediately settles the prediction with Ana as the winner
// Both NFTs are burned and Ana receives the full payout
```

## Limit Order System

The PredictionMarket contract now supports limit orders, providing makers with more control over their prediction terms and timing. This system allows makers to place orders that takers can fill at their convenience.

### How Limit Orders Work

1. **Maker places an order** using `placeOrder()` with specific terms
2. **Takers browse available orders** and fill them using `fillOrder()`
3. **Orders expire** after the specified deadline and can be cancelled
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
// Ana can only cancel orders after they expire
// First, wait for the deadline to pass...
// (In practice, this would happen after the orderDeadline timestamp)

// Then Ana can cancel the order
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
- ✅ **Direct Mint**: Create predictions by calling `mint()` with collateral
- ✅ **Limit Orders**: Place orders using `placeOrder()` for flexible timing
- ✅ Set the prediction outcomes and amount
- ✅ Get matched with a taker automatically (direct) or when takers fill orders
- ✅ Receive winnings if predictions correct
- ✅ Cancel unfilled orders after expiration
- ✅ No need to manage complex order books

### For Takers (like Bob and Carl):
- ✅ **Direct Competition**: Compete by calling `mint()` with the same prediction data
- ✅ **Order Filling**: Browse and fill limit orders using `fillOrder()`
- ✅ First to mint wins the taker position (direct) or first to fill order
- ✅ Provide delta amount directly when minting or filling orders
- ✅ No pre-deposits or complex order management needed
- ✅ Receive winnings if maker loses

### Two Trading Approaches:
- ✅ **Direct Mint/Burn**: Immediate prediction creation and competition
- ✅ **Limit Orders**: Place orders with specific terms and deadlines
- ✅ **Burn**: Settle prediction and distribute winnings (both approaches)
- ✅ **Consolidate**: Self-trade option for makers

### Limit Order System:
- ✅ **Place Orders**: Set specific terms with expiration deadlines
- ✅ **Fill Orders**: Browse available orders and fill when ready
- ✅ **Cancel Orders**: Cancel unfilled orders after expiration
- ✅ **Query Orders**: Get order details, counts, and maker-specific orders
- ✅ **Automatic Prediction Creation**: Filled orders create standard predictions

### Signature System:
- ✅ **ERC20 Permit**: No need for token approvals (direct mint only)
- ✅ **Taker Prediction Signature**: Ensures taker approves the specific prediction (direct mint only)
- ✅ **Automatic Validation**: Resolver validates markets and outcomes

### Security Features:
- ✅ Reentrancy protection
- ✅ Proper balance tracking
- ✅ NFT-based ownership verification
- ✅ Market validation through resolver
- ✅ Safe token transfers using permits
- ✅ Yes/No market validation only
- ✅ Order expiration and cancellation protection

## Choosing Between Direct Mint and Limit Orders

Both approaches create the same final predictions, but they serve different use cases:

### Use Direct Mint When:
- ✅ **Immediate execution** is desired
- ✅ **Competition-based** matching is preferred
- ✅ You want to **react quickly** to market conditions
- ✅ **Gas efficiency** is important (single transaction)
- ✅ You have **ERC20 permit signatures** ready
- ✅ You want **real-time** prediction creation

### Use Limit Orders When:
- ✅ **Flexible timing** is needed
- ✅ You want to **set specific terms** and wait for takers
- ✅ **Order management** is preferred over competition
- ✅ You want to **cancel orders** if conditions change
- ✅ **Browsing and selection** of orders is desired
- ✅ You need **time to prepare** before filling orders

### Comparison Summary:

| Feature | Direct Mint | Limit Orders |
|---------|-------------|--------------|
| **Execution** | Immediate | On-demand |
| **Competition** | First-come-first-served | Browse and select |
| **Timing** | Real-time | Flexible |
| **Cancellation** | Not applicable | After expiration |
| **Gas Cost** | Lower (single tx) | Higher (multiple txs) |
| **Signatures** | ERC20 permit required | Standard transfers |
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

// During mint():
// - Encodes prediction outcomes into bytes for efficient storage
// - Validates all markets are valid Yes/No markets
// - Ensures markets are not already settled
// - Checks market compatibility

// During burn():
// - Decodes the stored prediction outcomes
// - Verifies all markets are settled
// - Determines the outcome of each market
// - Calculates whether the maker won or lost
```

This comprehensive system provides both immediate execution (direct mint/burn) and flexible order management (limit orders) while maintaining the competitive nature of prediction markets. The dual approach accommodates different trading preferences:

- **Direct mint/burn** offers streamlined, immediate prediction creation with competition-based matching
- **Limit orders** provide flexible timing and order management capabilities
- Both approaches use the same **resolver validation** and **settlement mechanisms**
- The **NFT-based system** ensures clear ownership and easy tracking of predictions

The resolver ensures proper market validation and outcome determination for both trading approaches, making the system robust and user-friendly regardless of your preferred trading style. 