# PredictionMarket Contract Usage Examples

This document explains how to use the PredictionMarket contract with practical examples featuring three users: **Ana** (maker), **Bob** and **Carl** (takers).

## Overview

The PredictionMarket implements a streamlined prediction system where:
- **Makers** create predictions by calling `mint()` with their collateral and desired outcomes
- **Takers** compete by calling `mint()` with the same prediction data and their delta amount
- The **first taker to mint** within the time limit wins the opportunity
- Takers only provide the delta (profit amount), not the full payout
- After market resolution, the **winner** (maker or taker) calls `burn()` to settle and withdraw winnings
- Predictions can only be settled after markets are resolved



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

## Key Features Summary

### For Makers (like Ana):
- ✅ Create predictions by calling `mint()` with collateral
- ✅ Set the prediction outcomes and amount
- ✅ Get matched with a taker automatically
- ✅ Receive winnings if predictions correct
- ✅ No need to manage order books or expiration

### For Takers (like Bob and Carl):
- ✅ Compete by calling `mint()` with the same prediction data
- ✅ First to mint wins the taker position
- ✅ Provide delta amount directly when minting
- ✅ No pre-deposits or order management needed
- ✅ Receive winnings if maker loses

### Simplified Flow:
- ✅ **Mint**: Create prediction (maker) or claim taker position
- ✅ **Burn**: Settle prediction and distribute winnings
- ✅ **Consolidate**: Self-trade option for makers

### Signature System:
- ✅ **ERC20 Permit**: No need for token approvals
- ✅ **Taker Prediction Signature**: Ensures taker approves the specific prediction
- ✅ **Automatic Validation**: Resolver validates markets and outcomes

### Security Features:
- ✅ Reentrancy protection
- ✅ Proper balance tracking
- ✅ NFT-based ownership verification
- ✅ Market validation through resolver
- ✅ Safe token transfers using permits
- ✅ Yes/No market validation only

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

This streamlined system eliminates the complexity of order books while maintaining the competitive nature of prediction markets. The `mint`/`burn` pattern makes it easy to create and settle predictions, while the resolver ensures proper market validation and outcome determination. 