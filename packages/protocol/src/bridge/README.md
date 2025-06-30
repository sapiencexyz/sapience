# LayerZero Bridge for UMA Settlements

This bridge implementation enables UMA settlement functionality on networks where UMA is not deployed (e.g., Converge) by using LayerZero for cross-chain communication.

## Architecture Overview

The bridge consists of two main contracts:

1. **UMA-Side Bridge Contract (`UMALayerZeroBridge`)**
   - Deployed on the network where UMA is available
   - Interacts with UMA's OptimisticOracleV3
   - Manages bond tokens and gas fees
   - Handles cross-chain communication
   - Inherits from `ETHManagement` and `BondManagement` abstract contracts

2. **Market-Side Bridge Contract (`MarketLayerZeroBridge`)**
   - Deployed on networks without UMA, where the Markets live (e.g., Converge)
   - Implements UMA's interface for seamless integration
   - Tracks remote bond balances
   - Handles cross-chain communication
   - Inherits from `ETHManagement` abstract contract

## Abstract Contracts

The implementation uses several abstract contracts to share common functionality:

### `GasManagement`
- Manages gas thresholds (warning and critical)
- Sets and gets max execution gas
- Emits gas-related events
- Inherits from `Ownable`

### `ETHManagement`
- Manages ETH deposits and withdrawals
- Provides ETH balance checking
- Implements receive function
- Inherits from `GasManagement`

### `BondManagement`
- Manages bond token deposits and withdrawals
- Implements withdrawal intent system with delay
- Tracks bond balances and withdrawal intents
- Provides bond management functions
- Inherits from `ReentrancyGuard`

## Data Structures

### Bridge Configuration
```solidity
struct BridgeConfig {
    uint32 remoteChainId;    // LayerZero chain ID of the other bridge
    address remoteBridge;    // Address of the other bridge contract
    address settlementModule; // Settlement module address
}
```

### Withdrawal Intent
```solidity
struct WithdrawalIntent {
    uint256 amount;
    uint256 timestamp;
    bool executed;
}
```

## Contract Interactions

### Settlement Flow

1. **Market Submission (Converge)**
   ```
   Market -> UMASettlementModule -> MarketBridge.forwardAssertTruth()
   ```
   - Market submits settlement as usual
   - UMASettlementModule calls `forwardAssertTruth()` on MarketBridge
   - MarketBridge checks remote bond balance
   - MarketBridge sends settlement data via LayerZero

2. **Cross-Chain Communication**
   ```
   MarketBridge -> LayerZero -> UMABridge
   ```
   - MarketBridge deducts bond from remote balance
   - Sends settlement data via LayerZero using `CMD_TO_UMA_ASSERT_TRUTH`
   - UMABridge receives the message and creates UMA assertion

3. **UMA Assertion**
   ```
   UMABridge -> OptimisticOracleV3
   ```
   - UMABridge submits assertion to UMA using escrowed bond tokens
   - Manages bond tokens on UMA side
   - Waits for verification period

4. **Verification Flow**
   ```
   OptimisticOracleV3 -> UMABridge -> LayerZero -> MarketBridge -> Market
   ```
   - UMA resolves the assertion
   - UMABridge sends result via LayerZero using `CMD_FROM_UMA_RESOLVED_CALLBACK`
   - MarketBridge receives and forwards to Market

### Dispute Flow

1. **Dispute Initiation (UMA)**
   ```
   Disputer -> OptimisticOracleV3 -> UMABridge
   ```
   - Someone disputes the assertion on UMA
   - OptimisticOracleV3 calls `assertionDisputedCallback()` on UMABridge

2. **Cross-Chain Dispute Notification**
   ```
   UMABridge -> LayerZero -> MarketBridge
   ```
   - UMABridge sends dispute notification via LayerZero using `CMD_FROM_UMA_DISPUTED_CALLBACK`
   - MarketBridge receives and forwards to Market

## Token Management

### Bond Token Escrow System

The bridge implements an escrow-based bond management system:

1. **Pre-funding Bonds (UMA Side)**
   ```
   Submitter -> UMABridge.depositBond()
   ```
   - Submitters pre-fund their bond tokens on the UMA-side bridge
   - Each submitter's balance is tracked separately
   - Market-side bridge maintains a view of these balances via LayerZero messages

2. **Settlement Flow**
   ```
   Market -> MarketBridge (checks balance) -> LayerZero -> UMABridge (uses escrow) -> UMA
   ```
   - Market-side bridge verifies submitter's escrow balance
   - If sufficient balance exists, settlement proceeds
   - UMA-side bridge uses escrowed funds for UMA assertion

3. **Balance Management**
   ```solidity
   // UMA-Side Bridge (BondManagement)
   mapping(address => mapping(address => uint256)) private submitterBondBalances;  // submitter => bondToken => balance
   mapping(address => mapping(address => WithdrawalIntent)) private withdrawalIntents; // submitter => bondToken => intent
   
   // Market-Side Bridge
   mapping(address => mapping(address => uint256)) private remoteSubmitterBalances; // submitter => bondToken => balance
   mapping(address => mapping(address => uint256)) private remoteSubmitterWithdrawalIntent; // submitter => bondToken => amount
   ```

### Bond Management Functions

#### UMA-Side Bridge (BondManagement)
```solidity
function depositBond(address bondToken, uint256 amount) external returns (MessagingReceipt memory);
function intentToWithdrawBond(address bondToken, uint256 amount) external returns (MessagingReceipt memory);
function executeWithdrawal(address bondToken) external returns (MessagingReceipt memory);
function getBondBalance(address submitter, address bondToken) external view returns (uint256);
function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256);
```

#### Market-Side Bridge
```solidity
function getRemoteSubmitterBalance(address submitter, address bondToken) external view returns (uint256);
function getRemoteSubmitterWithdrawalIntent(address submitter, address bondToken) external view returns (uint256);
```

### Async Withdrawal Process

The bridge implements a two-step withdrawal process to handle LayerZero delays:

1. **Withdrawal Intent**
   ```
   Submitter -> UMABridge.intentToWithdrawBond()
   ```
   - Submitter initiates withdrawal intent
   - Specifies bond token and amount
   - Starts waiting period (1 day)
   - Prevents new settlements during waiting period

2. **Withdrawal Execution**
   ```
   Submitter -> UMABridge.executeWithdrawal()
   ```
   - Can be executed after waiting period
   - Verifies no pending settlements
   - Transfers tokens to submitter
   - Clears withdrawal intent

### Balance Synchronization

The bridge implements real-time balance synchronization via LayerZero messages:

1. **Balance Update Flow**
   ```
   UMA-Side Bridge -> LayerZero -> Market-Side Bridge
   ```
   - When a bond is deposited: `CMD_FROM_ESCROW_DEPOSIT`
   - When a withdrawal intent is created: `CMD_FROM_ESCROW_INTENT_TO_WITHDRAW`
   - When a withdrawal is executed: `CMD_FROM_ESCROW_WITHDRAW`
   - When a bond is returned: `CMD_FROM_ESCROW_BOND_RECEIVED`

2. **Message Structure**
   ```solidity
   struct BalanceUpdate {
       address submitter;
       address bondToken;
       uint256 finalAmount;
       uint256 deltaAmount;
   }
   ```

## Command Types

The bridge uses the following LayerZero command types:

```solidity
uint16 constant CMD_TO_UMA_ASSERT_TRUTH = 1;                    // Market -> UMA
uint16 constant CMD_FROM_UMA_RESOLVED_CALLBACK = 2;             // UMA -> Market
uint16 constant CMD_FROM_UMA_DISPUTED_CALLBACK = 3;             // UMA -> Market
uint16 constant CMD_FROM_ESCROW_DEPOSIT = 4;                    // UMA -> Market
uint16 constant CMD_FROM_ESCROW_INTENT_TO_WITHDRAW = 5;         // UMA -> Market
uint16 constant CMD_FROM_ESCROW_WITHDRAW = 6;                   // UMA -> Market
uint16 constant CMD_FROM_ESCROW_BOND_RECEIVED = 8;              // UMA -> Market
```

## Market Group Management

The Market-Side Bridge manages enabled market groups:

```solidity
mapping(address => bool) private enabledMarketGroups;
mapping(uint256 => address) private assertionIdToMarketGroup;
mapping(address => mapping(uint256 => bytes32)) private marketEpochToLocalId;
```

## ETH Management

Both bridges inherit from `ETHManagement` which provides:

- ETH deposit and withdrawal functions
- Gas threshold monitoring
- Automatic gas reserve checking before LayerZero operations
- Warning and critical threshold events

## Security Features

1. **Access Control**
   - Owner-only functions for critical operations
   - Market group enablement system
   - Trusted remote validation

2. **Reentrancy Protection**
   - All external functions are nonReentrant
   - Secure token transfers
   - Protected cross-chain message handling

3. **Gas Management**
   - Gas reserve monitoring with thresholds
   - Automatic gas checking before LayerZero operations
   - Warning and critical threshold events

## Configuration

Each bridge contract requires the following configuration:

```solidity
struct BridgeConfig {
    uint32 remoteChainId;    // LayerZero chain ID of the other bridge
    address remoteBridge;    // Address of the other bridge contract
    address settlementModule; // Settlement module address
}
```

## Events

The bridge contracts emit various events for monitoring:

### Bond Management Events
- `BondDeposited(address indexed submitter, address indexed bondToken, uint256 amount)`
- `BondWithdrawalIntentCreated(address indexed submitter, address indexed bondToken, uint256 amount, uint256 timestamp)`
- `WithdrawalExecuted(address indexed submitter, address indexed bondToken, uint256 amount)`

### ETH Management Events
- `ETHDeposited(address indexed depositor, uint256 amount)`
- `ETHWithdrawn(address indexed recipient, uint256 amount)`

### Gas Management Events
- `GasReserveLow(uint256 currentBalance)`
- `GasReserveCritical(uint256 currentBalance)`

### Bridge Events
- `BridgeConfigUpdated(BridgeTypes.BridgeConfig config)`
- `AssertionSubmitted(address indexed marketGroup, uint256 indexed marketId, uint256 assertionId)`
- `BondWithdrawn(address indexed submitter, address indexed bondToken, uint256 amount)`

## Integration

To integrate with the bridge:

1. Deploy both bridge contracts on their respective networks
2. Configure the bridge parameters using `setBridgeConfig()`
3. Pre-fund the gas reserves using `depositETH()`
4. Pre-fund bond tokens on UMA-side using `depositBond()`
5. Enable market groups on Market-side using `enableMarketGroup()`
6. The UMASettlementModule will work as usual, interacting with the bridge instead of UMA

## Maintenance

Regular maintenance tasks:

1. Monitor gas reserves (check `getETHBalance()` and gas threshold events)
2. Monitor bond token reserves (check `getBondBalance()`)
3. Check for any failed cross-chain messages
4. Verify UMA assertion statuses
5. Handle any disputed settlements

## Security Considerations

1. Always maintain sufficient gas reserves
2. Monitor bond token reserves
3. Keep track of cross-chain message status
4. Have a plan for handling disputed settlements
5. Regular security audits of the bridge contracts
6. Monitor withdrawal intents and ensure proper delay periods
