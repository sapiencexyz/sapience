# LayerZero Bridge for UMA Settlements

This bridge implementation enables UMA settlement functionality on networks where UMA is not deployed (e.g., Converge) by using LayerZero for cross-chain communication.

## Architecture Overview

The bridge consists of two main contracts:

1. **UMA-Side Bridge Contract**
   - Deployed on the network where UMA is available
   - Interacts with UMA's OptimisticOracleV3
   - Manages bond tokens and gas fees
   - Handles cross-chain communication

2. **Market-Side Bridge Contract**
   - Deployed on networks without UMA, where the Markets live (e.g., Converge)
   - Implements UMA's interface for seamless integration
   - Manages local bond tokens
   - Handles cross-chain communication

## Market Identification

Since multiple markets can interact with the same bridge, we use a composite key of `marketAddress/epochId` for all mappings:

```solidity
// UMA-Side Bridge
mapping(address => mapping(uint256 => bytes32)) public marketEpochToAssertionId;  // marketAddress => epochId => assertionId
mapping(bytes32 => address) public assertionIdToMarket;                           // assertionId => marketAddress
mapping(bytes32 => uint256) public assertionIdToEpoch;                           // assertionId => epochId

// Market-Side Bridge
mapping(address => mapping(uint256 => bool)) public processedMarketEpochs;        // marketAddress => epochId => processed
mapping(address => mapping(uint256 => bytes32)) public marketEpochToLocalId;      // marketAddress => epochId => localId
```

This ensures that:
- Each market's epochs are tracked independently
- No conflicts between different markets using the same epoch IDs
- Clear mapping between UMA assertions and market epochs
- Proper tracking of processed settlements per market

## Contract Interactions

### Settlement Flow

1. **Market Submission (Converge)**
   ```
   Market -> UMASettlementModule -> MarketBridge
   ```
   - Market submits settlement as usual
   - UMASettlementModule interacts with what it thinks is UMA
   - MarketBridge receives the request and tracks it with marketAddress/epochId

2. **Cross-Chain Communication**
   ```
   MarketBridge -> LayerZero -> UMABridge
   ```
   - MarketBridge locks bond tokens
   - Sends settlement data via LayerZero
   - UMABridge receives the message and tracks it with marketAddress/epochId

3. **UMA Assertion**
   ```
   UMABridge -> OptimisticOracleV3
   ```
   - UMABridge submits assertion to UMA
   - Manages bond tokens on UMA side
   - Waits for verification period
   - Tracks assertion with marketAddress/epochId

4. **Verification Flow**
   ```
   OptimisticOracleV3 -> UMABridge -> LayerZero -> MarketBridge -> Market
   ```
   - UMA resolves the assertion
   - Result is sent back to Converge
   - Market is notified of the result
   - Bond tokens are handled accordingly
   - All tracking uses marketAddress/epochId

### Dispute Flow

1. **Dispute Initiation (UMA)**
   ```
   Disputer -> OptimisticOracleV3 -> UMABridge
   ```
   - Someone disputes the assertion on UMA
   - OptimisticOracleV3 notifies UMABridge
   - UMABridge marks the assertion as disputed
   - Dispute is tracked with marketAddress/epochId

2. **Cross-Chain Dispute Notification**
   ```
   UMABridge -> LayerZero -> MarketBridge
   ```
   - UMABridge sends dispute notification
   - MarketBridge receives the dispute status
   - MarketBridge marks local settlement as disputed
   - Dispute status is tracked with marketAddress/epochId

3. **Market Notification**
   ```
   MarketBridge -> UMASettlementModule -> Market
   ```
   - MarketBridge notifies the market of the dispute
   - Market can handle the disputed settlement accordingly
   - Bond tokens remain locked until resolution
   - All tracking uses marketAddress/epochId

4. **Dispute Resolution**
   ```
   OptimisticOracleV3 -> UMABridge -> LayerZero -> MarketBridge -> Market
   ```
   - UMA resolves the dispute
   - Result is propagated back to Market
   - Bond tokens are handled based on resolution:
     - If asserter wins: Return bond tokens
     - If disputer wins: Bond tokens go to disputer
   - Resolution is tracked with marketAddress/epochId

## Token Management

### Bond Tokens
The bridge implements an escrow-based bond management system where:

1. **Pre-funding Bonds (UMA Side)**
   ```
   Submitter -> UMABridge (escrow)
   ```
   - Submitters pre-fund their bond tokens on the UMA-side bridge
   - Each submitter's balance is tracked separately
   - Market-side bridge maintains a view of these balances
   - No need for cross-chain token transfers during settlement

2. **Settlement Flow**
   ```
   Market -> MarketBridge (checks balance) -> LayerZero -> UMABridge (uses escrow) -> UMA
   ```
   - Market-side bridge verifies submitter's escrow balance
   - If sufficient balance exists, settlement proceeds
   - UMA-side bridge uses escrowed funds for UMA assertion
   - No token transfers needed during settlement

3. **Balance Management**
   ```solidity
   // UMA-Side Bridge
   mapping(address => mapping(address => uint256)) public submitterBondBalances;  // submitter => bondToken => balance
   
   // Market-Side Bridge
   mapping(address => mapping(address => uint256)) public remoteSubmitterBalances; // submitter => bondToken => balance
   ```

### Market-Specific Bond Configuration
```solidity
struct MarketBondConfig {
    address bondToken;            // Token used for bonds
    uint256 bondAmount;           // Amount of bond tokens required
}

// Market-Side Bridge
mapping(address => MarketBondConfig) public marketBondConfigs;  // marketAddress => config
```

### Bond Management Functions
```solidity
// UMA-Side Bridge
function depositBond(address bondToken, uint256 amount) external;
function intentToWithdrawBond(address bondToken, uint256 amount) external;
function executeWithdrawal(address bondToken) external;
function getBondBalance(address submitter, address bondToken) external view returns (uint256);
function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256);

// Market-Side Bridge
function getRemoteBondBalance(address submitter, address bondToken) external view returns (uint256);
```

### Async Withdrawal Process
The bridge implements a two-step withdrawal process to handle LayerZero delays:

1. **Withdrawal Intent**
   ```
   Submitter -> UMABridge (intentToWithdraw)
   ```
   - Submitter initiates withdrawal intent
   - Specifies bond token and amount
   - Starts waiting period
   - Prevents new settlements during waiting period
   - Emits intent event

2. **Waiting Period**
   ```solidity
   struct WithdrawalIntent {
       uint256 amount;
       uint256 timestamp;
       bool executed;
   }
   
   mapping(address => mapping(address => WithdrawalIntent)) public withdrawalIntents;  // submitter => bondToken => intent
   ```
   - Default waiting period (e.g., 24 hours)
   - Allows time for any pending LayerZero messages
   - Prevents race conditions with settlements
   - Can be adjusted per market if needed

3. **Withdrawal Execution**
   ```
   Submitter -> UMABridge (executeWithdrawal)
   ```
   - Can be executed after waiting period
   - Verifies no pending settlements
   - Checks LayerZero message status
   - Transfers tokens to submitter
   - Clears withdrawal intent

4. **Settlement During Withdrawal**
   - If settlement is attempted during waiting period:
     - Reverts if amount would exceed available balance
     - Available balance = current balance - pending withdrawal
   - If settlement is attempted after withdrawal:
     - Uses updated balance after withdrawal
     - Ensures no double-spending

### Balance Synchronization
The bridge implements a real-time balance synchronization mechanism:

1. **Balance Update Flow**
   ```
   UMA-Side Bridge -> LayerZero -> Market-Side Bridge
   ```
   - When a bond is deposited on UMA side
   - When a bond is withdrawn on UMA side
   - When a bond is used for UMA assertion
   - When a bond is returned after settlement

2. **Message Types**
   ```solidity
   enum BalanceUpdateType {
       DEPOSIT,
       WITHDRAWAL,
       ASSERTION_USED,
       ASSERTION_RETURNED
   }

   struct BalanceUpdate {
       address submitter;
       address bondToken;
       uint256 newBalance;
       BalanceUpdateType updateType;
   }
   ```

3. **Synchronization Process**
   - UMA-side bridge sends balance updates via LayerZero
   - Market-side bridge updates its local balance view
   - Updates are processed in order to maintain consistency
   - Failed updates are retried to ensure synchronization

4. **Balance Verification**
   - Market-side bridge verifies balances before allowing settlements
   - Reverts if balance is insufficient
   - Maintains a small buffer for pending updates
   - Emits events for synchronization issues

### Gas Management
- Maintains gas reserves on both sides
- Monitors gas levels with warning and critical thresholds
- Emits events for low gas conditions
- Allows manual top-up of gas reserves

## Security Features

1. **Access Control**
   - Owner-only functions for critical operations
   - Trusted remote validation
   - Message source verification

2. **Reserve Monitoring**
   - Gas reserve monitoring
   - Bond token reserve monitoring
   - Warning and critical thresholds
   - Emergency pause functionality

3. **Reentrancy Protection**
   - All external functions are nonReentrant
   - Secure token transfers
   - Protected cross-chain message handling

## Configuration

Each bridge contract requires the following configuration:

```solidity
struct BridgeConfig {
    address optimisticOracleV3;   // UMA's OptimisticOracleV3 address (UMA side only)
    uint256 assertionLiveness;    // UMA's assertion liveness period
    uint16 remoteChainId;         // LayerZero chain ID of the other bridge
    address remoteBridge;         // Address of the other bridge contract
    uint256 balanceUpdateTimeout; // Timeout for balance updates
    uint256 withdrawalDelay;      // Waiting period for withdrawals
}

struct MarketBondConfig {
    address bondToken;            // Token used for bonds
    uint256 bondAmount;           // Amount of bond tokens required
}
```

## Events

The bridge contracts emit various events for monitoring and tracking:

- `SettlementSubmitted`: When a settlement is submitted (includes marketAddress)
- `SettlementVerified`: When a settlement is verified (includes marketAddress)
- `SettlementDisputed`: When a settlement is disputed (includes marketAddress)
- `DisputeResolved`: When a dispute is resolved (includes marketAddress)
- `BridgeConfigUpdated`: When bridge configuration is updated
- `MarketBondConfigUpdated`: When a market's bond configuration is updated
- `GasReserveLow`: When gas reserve is below warning threshold
- `GasReserveCritical`: When gas reserve is below critical threshold
- `BondDeposited`: When a submitter deposits bond tokens
- `WithdrawalIntentCreated`: When a withdrawal intent is created
- `WithdrawalExecuted`: When a withdrawal is executed
- `WithdrawalCancelled`: When a withdrawal is cancelled
- `InsufficientBondBalance`: When a settlement is attempted with insufficient bond balance
- `BalanceUpdateSent`: When a balance update is sent via LayerZero
- `BalanceUpdateReceived`: When a balance update is received and processed
- `BalanceUpdateFailed`: When a balance update fails to process
- `BalanceSyncError`: When there's a synchronization error between bridges

## Integration

To integrate with the bridge:

1. Deploy both bridge contracts on their respective networks
2. Configure the bridge parameters
3. Pre-fund the gas and bond token reserves
4. Set up the trusted remote paths
5. The UMASettlementModule will work as usual, interacting with the bridge instead of UMA on networks where UMA is not available

## Maintenance

Regular maintenance tasks:

1. Monitor gas reserves
2. Monitor bond token reserves
3. Check for any failed cross-chain messages
4. Verify UMA assertion statuses
5. Handle any disputed settlements

## Security Considerations

1. Always maintain sufficient gas reserves
2. Monitor bond token reserves
3. Keep track of cross-chain message status
4. Have a plan for handling disputed settlements
5. Regular security audits of the bridge contracts
