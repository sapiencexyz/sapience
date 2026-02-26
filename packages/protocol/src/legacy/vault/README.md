# Passive Liquidity Vault

An ERC-20 share token vault with a request-based flow for deposits and withdrawals. A designated EOA "manager" deploys funds to external protocols and processes user requests. The contract uses a request-based system to enforce fair pricing, rate limits, and safety constraints.

## Request-based interface

This vault uses a request-based API instead of immediate execution:
- `requestDeposit(uint256 assets, uint256 expectedShares)`
- `requestWithdrawal(uint256 shares, uint256 expectedAssets)`
- `processDeposit(address requestedBy)` and `processWithdrawal(address requestedBy)` (manager only)
- `emergencyWithdraw(uint256 shares)` (when emergency mode is active)

Additional views/utilities:
- `availableAssets()` returns the vault's token balance
- `totalDeployed()` returns capital deployed in external protocols
- `utilizationRate()` returns deployed/(deployed+available) in WAD (1e18 = 100%)

## Features

### Core functionality
- **Request-based operations**: One pending request per user at a time (deposit or withdrawal)
- **Interaction delay**: Users must wait between requests (default: 1 day)
- **Request expiration**: Requests expire (default: 10 minutes) and can be cancelled by the user
- **EOA management**: A designated manager processes requests (individually or in batches) and deploys/recalls funds
- **Utilization limits**: Max utilization (default: 80%) enforced when approving deployments
- **Emergency mode**: Proportional withdrawals from on-vault balance only
- **Share locking**: Shares pending withdrawal cannot be transferred until the request is processed or cancelled

### Safety features
- **Reentrancy protection** via `ReentrancyGuard`
- **Pausable** by owner
- **Access control**: Owner vs Manager responsibilities

## Architecture

### Key components

1. **Request Management**
   - Single `PendingRequest` per user at a time
   - Users create requests; the manager processes them before they expire
   - Users can cancel their own requests after expiration

2. **Asset Management**
   - Underlying asset from `asset()`
   - ERC-20 shares minted/burned on processing
   - `unconfirmedAssets` tracks assets held for unprocessed deposit requests

3. **Fund Deployment**
   - Manager can `approveFundsUsage(protocol, amount)` to approve token spending for external protocols
   - Active protocols tracked; automatically cleaned up when both deposits and allowance reach zero
   - Utilization limit enforced based on total **approvals** (not just deployed funds) to prevent over-commitment
   - `totalDeployed()` sums collateral actually deposited in supported protocols
   - `utilizationRate()` returns deployed/(deployed+available) ratio

4. **Risk Management**
   - `maxUtilizationRate` cap (in WAD, e.g., 0.8e18 = 80%) enforced on **total approvals**
   - Prevents over-commitment by checking approvals before actual deployment
   - `interactionDelay` between user requests (can be reset to zero when requests expire)
   - `expirationTime` for requests
   - Emergency mode toggle by owner

### State variables (selected)

```solidity
address public manager;                 // EOA manager address
uint256 public maxUtilizationRate;      // Max utilization (in WAD, e.g., 0.8e18 = 80%)
uint256 public interactionDelay;        // Delay between user requests
uint256 public expirationTime;          // Request expiration window
bool public emergencyMode;              // Emergency mode flag
uint256 public constant WAD = 1e18;     // WAD denominator for high-precision calculations

// Requests and accounting
mapping(address => uint256) public lastUserInteractionTimestamp;
mapping(address => PendingRequest) public pendingRequests;
uint256 private unconfirmedAssets;      // Deposits awaiting processing

// Active protocols (EnumerableSet)
EnumerableSet.AddressSet private activeProtocols;
```

### Data structures

```solidity
struct PendingRequest {
    address user;
    bool isDeposit;     // true for deposit, false for withdrawal
    uint256 shares;     // expected shares for deposits; burn amount for withdrawals
    uint256 assets;     // deposit amount; expected assets for withdrawals
    uint256 timestamp;  // creation time
    bool processed;     // processed flag
}
```

## Request system

### Lifecycle
1. User submits a request:
   - Deposit: `requestDeposit(assets, expectedShares)` transfers `assets` to the vault and records the request
   - Withdrawal: `requestWithdrawal(shares, expectedAssets)` records the request (no immediate transfer, shares are locked)
2. Manager validates and processes before `expirationTime`:
   - `processDeposit(requestedBy)` mints `shares` to the user
   - `processWithdrawal(requestedBy)` burns `shares` and transfers `assets` to the user
3. If not processed in time, users can cancel:
   - `cancelDeposit()` returns assets and resets interaction timestamp (allows immediate new request)
   - `cancelWithdrawal()` clears the request and resets interaction timestamp (allows immediate new request)
4. Users must respect `interactionDelay` between consecutive requests (unless cancelled due to expiration)

### Benefits
- **Fair processing** under manager control
- **Predictable timing** via interaction delay and expiration
- **Safety** against rapid-fire interactions and stale prices

## Usage

### For users

#### Depositing
```solidity
// Approve vault to spend tokens
asset.approve(address(vault), assets);

// Create a deposit request
vault.requestDeposit(assets, expectedShares);
```

#### Withdrawing
```solidity
// Create a withdrawal request
vault.requestWithdrawal(shares, expectedAssets);
```

#### Cancelling after expiration
```solidity
vault.cancelDeposit();
vault.cancelWithdrawal();
```

#### Emergency withdrawal
```solidity
// Only available when emergency mode is active; uses on-vault balance proportionally
vault.emergencyWithdraw(shares);
```

### For manager (EOA)

#### Processing
```solidity
// Process individual requests
vault.processDeposit(user);
vault.processWithdrawal(user);

// Batch process multiple requests
address[] memory depositors = [user1, user2, user3];
vault.batchProcessDeposit(depositors);

address[] memory withdrawers = [user4, user5, user6];
vault.batchProcessWithdrawal(withdrawers);
```

#### Approving funds usage
```solidity
vault.approveFundsUsage(protocolAddress, amount);

// Clean up inactive protocols (zero deposits and zero allowance)
vault.cleanInactiveProtocols();
```

#### Deployment status
```solidity
uint256 deployed = vault.totalDeployed();
uint256 numProtocols = vault.getActiveProtocolsCount();
address[] memory allProtocols = vault.getActiveProtocols();
address first = vault.getActiveProtocol(0);
```

### For owner

#### Configuration
```solidity
vault.setManager(newManager);
vault.setMaxUtilizationRate(0.8e18);   // 80% in WAD
vault.setInteractionDelay(1 days);     // default
vault.setExpirationTime(10 minutes);   // default
vault.toggleEmergencyMode();
vault.pause();
vault.unpause();
```

## Key functions

### Request functions
- `requestDeposit(uint256 assets, uint256 expectedShares)`
- `requestWithdrawal(uint256 shares, uint256 expectedAssets)`
- `cancelDeposit()` / `cancelWithdrawal()`
- `processDeposit(address requestedBy)` / `processWithdrawal(address requestedBy)` (manager)
- `batchProcessDeposit(address[] requesters)` / `batchProcessWithdrawal(address[] requesters)` (manager)

### Manager functions
- `approveFundsUsage(address protocol, uint256 amount)`
- `cleanInactiveProtocols()`

### Emergency
- `emergencyWithdraw(uint256 shares)`

### Views
- `availableAssets()`
- `totalDeployed()`
- `utilizationRate()`
- `getActiveProtocolsCount()` / `getActiveProtocols()` / `getActiveProtocol(uint256)`
- `getLockedShares(address)` / `getAvailableShares(address)`

## Events

### Request events
- `PendingRequestCreated(address indexed user, bool direction, uint256 shares, uint256 assets)`
- `PendingRequestProcessed(address indexed user, bool direction, uint256 shares, uint256 assets)`
- `PendingRequestCancelled(address indexed user, bool direction, uint256 shares, uint256 assets)`

### Manager and configuration
- `FundsApproved(address indexed manager, uint256 assets, address targetProtocol)`
- `UtilizationRateUpdated(uint256 oldRate, uint256 newRate)`
- `ManagerUpdated(address indexed oldManager, address indexed newManager)`
- `InteractionDelayUpdated(uint256 oldDelay, uint256 newDelay)`
- `ExpirationTimeUpdated(uint256 oldExpirationTime, uint256 newExpirationTime)`

### Emergency
- `EmergencyWithdrawal(address indexed user, uint256 shares, uint256 assets)`

## Security considerations
- Reentrancy guarded processing and transfers
- Strict role separation (Owner vs Manager)
- Enforced interaction delays between user requests
- Utilization checks on deployments
- Pausable + emergency mode
- Share transfer restrictions: Users cannot transfer shares locked in pending withdrawal requests
- Automatic reset of interaction delay when requests expire and are cancelled

## Testing

Run tests with:
```bash
forge test --match-path test/vault/PassiveLiquidityVault.t.sol
```

## Deployment
1. Deploy underlying asset (or use an existing ERC-20)
2. Deploy the vault with asset address, manager address, name, and symbol
3. Configure parameters (`setMaxUtilizationRate`, `setInteractionDelay`, `setExpirationTime`)
4. Transfer ownership to governance if applicable

## Integration examples

### Prediction markets
```solidity
vault.approveFundsUsage(predictionMarketAddress, amount);
// Manager later calls processDeposit/processWithdrawal as market conditions allow
```

### DEXes / lending
```solidity
vault.approveFundsUsage(protocol, amount);
```

## Gas optimization notes
- Minimal external calls and storage writes
- EnumerableSet for active protocol tracking
- No on-chain FIFO queues or batch loops

## Upgradeability
The contract is not upgradeable; parameters are configurable by the owner.

## License
MIT License - see LICENSE file for details.