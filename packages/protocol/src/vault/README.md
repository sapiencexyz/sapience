# Passive Liquidity Vault

An **ERC-4626 compliant** Solidity smart contract that implements a passive liquidity vault where an EOA (Externally Owned Account) can manage deposited funds to interact with other protocols. The vault includes utilization rate management, withdrawal queue, and comprehensive safety mechanisms.

## ✅ ERC-4626 Compliance

This vault is fully compliant with the ERC-4626 "Tokenized Vault Standard", providing:
- Standardized deposit/withdraw/mint/redeem functions
- Automatic share-to-asset conversion
- Maximum DeFi interoperability
- Protection against inflation attacks through virtual shares

## Features

### Core Functionality
- **Deposit/Withdrawal**: Users can deposit assets and receive shares representing their portion of the vault
- **EOA Management**: A designated manager (EOA) can deploy funds to external protocols
- **Utilization Rate**: Configurable maximum utilization rate to control risk
- **Withdrawal Queue**: Ordered withdrawal system with configurable delay
- **Emergency Mode**: Emergency withdrawal mechanism bypassing normal queue

### Safety Features
- **Reentrancy Protection**: All external calls are protected against reentrancy attacks
- **Pausable**: Contract can be paused by owner in emergency situations
- **Access Control**: Role-based access control for different functions
- **Utilization Limits**: Maximum utilization rate prevents over-leverage
- **Withdrawal Delay**: Time delay on withdrawals to prevent bank runs

## Architecture

### Key Components

1. **Asset Management**
   - ERC20 token representing the underlying asset
   - Share-based accounting system
   - Automatic conversion between assets and shares

2. **Fund Deployment**
   - Manager can deploy funds to external protocols
   - Tracks deployment amounts and protocols
   - Maintains utilization rate calculations

3. **Withdrawal System**
   - Queue-based withdrawal processing
   - Configurable withdrawal delay
   - Emergency withdrawal bypass

4. **Risk Management**
   - Maximum utilization rate limits
   - Emergency mode for crisis situations
   - Pausable functionality

### State Variables

```solidity
IERC20 public immutable asset;           // Underlying asset token
address public manager;                  // EOA manager address
uint256 public maxUtilizationRate;       // Max utilization (basis points)
uint256 public utilizationRate;          // Current utilization (basis points)
uint256 public withdrawalDelay;          // Withdrawal delay in seconds
uint256 public totalDeployed;            // Total deployed to protocols
WithdrawalRequest[] public withdrawalQueue; // Withdrawal queue
mapping(address => DeploymentInfo) public deployments; // Protocol deployments
```

## Usage

### For Users

#### Depositing
```solidity
// Approve vault to spend tokens
asset.approve(address(vault), amount);

// Deposit tokens and receive shares
uint256 shares = vault.deposit(amount);
```

#### Withdrawing
```solidity
// Request withdrawal (burns shares immediately)
uint256 queuePosition = vault.requestWithdrawal(shares);

// Wait for withdrawal delay, then anyone can process
vault.processWithdrawals(maxRequests);
```

#### Emergency Withdrawal
```solidity
// Only available when emergency mode is active
vault.emergencyWithdraw(shares);
```

### For Manager (EOA)

#### Deploying Funds
```solidity
// Deploy funds to a protocol with calldata
vault.deployFunds(protocolAddress, amount, calldata);
```

#### Recalling Funds
```solidity
// Recall funds from a protocol
vault.recallFunds(protocolAddress, amount, calldata);
```

### For Owner

#### Configuration
```solidity
// Set new manager
vault.setManager(newManager);

// Set maximum utilization rate (basis points)
vault.setMaxUtilizationRate(8000); // 80%

// Set withdrawal delay
vault.setWithdrawalDelay(1 days);

// Toggle emergency mode
vault.toggleEmergencyMode();

// Pause/unpause contract
vault.pause();
vault.unpause();
```

## Key Functions

### Deposit Functions
- `deposit(uint256 amount)`: Deposit assets and receive shares
- `depositAndRequestWithdrawal(uint256 amount)`: Deposit and immediately request withdrawal

### Withdrawal Functions
- `requestWithdrawal(uint256 shares)`: Request withdrawal of shares
- `processWithdrawals(uint256 maxRequests)`: Process withdrawal requests
- `emergencyWithdraw(uint256 shares)`: Emergency withdrawal (bypasses queue)

### Manager Functions
- `deployFunds(address protocol, uint256 amount, bytes calldata data)`: Deploy funds to protocol
- `recallFunds(address protocol, uint256 amount, bytes calldata data)`: Recall funds from protocol

### View Functions
- `totalAssets()`: Get total assets in vault
- `getPendingWithdrawal(address user)`: Get user's pending withdrawal amount
- `getWithdrawalQueueLength()`: Get length of withdrawal queue
- `getActiveProtocolsCount()`: Get number of active protocols

## Events

The contract emits comprehensive events for all major operations:

- `Deposit`: When users deposit assets
- `WithdrawalRequested`: When withdrawal is requested
- `WithdrawalProcessed`: When withdrawal is processed
- `FundsDeployed`: When manager deploys funds
- `FundsRecalled`: When manager recalls funds
- `UtilizationRateUpdated`: When utilization rate changes
- `EmergencyWithdrawal`: When emergency withdrawal occurs

## Security Considerations

### Reentrancy Protection
All external calls are protected using OpenZeppelin's `ReentrancyGuard`.

### Access Control
- **Owner**: Can configure parameters, pause contract, set manager
- **Manager**: Can deploy and recall funds to/from protocols
- **Users**: Can deposit, request withdrawals, process withdrawals

### Risk Management
- **Utilization Limits**: Prevents over-leverage of vault funds
- **Withdrawal Delay**: Prevents bank runs and allows for liquidity management
- **Emergency Mode**: Allows immediate withdrawals in crisis situations
- **Pausable**: Can halt operations if needed

### Economic Security
- **Share-based Accounting**: Fair distribution of vault performance
- **Queue System**: Ensures orderly withdrawal processing
- **Protocol Tracking**: Monitors all external deployments

## Testing

The contract includes comprehensive tests covering:

- Deposit and withdrawal functionality
- Fund deployment and recall
- Utilization rate management
- Withdrawal queue processing
- Emergency scenarios
- Access control
- Edge cases and error conditions

Run tests with:
```bash
forge test --match-path test/vault/PassiveLiquidityVault.t.sol
```

## Deployment

1. Deploy the underlying asset token (if not using existing)
2. Deploy the vault with asset address and manager address
3. Configure parameters (max utilization, withdrawal delay)
4. Transfer ownership to governance contract (if applicable)

## Integration Examples

### With Lending Protocols
```solidity
// Deploy to Compound
vault.deployFunds(
    compoundTokenAddress,
    amount,
    abi.encodeWithSignature("mint(uint256)", amount)
);

// Recall from Compound
vault.recallFunds(
    compoundTokenAddress,
    amount,
    abi.encodeWithSignature("redeem(uint256)", shares)
);
```

### With DEX Liquidity Pools
```solidity
// Add liquidity to Uniswap
vault.deployFunds(
    uniswapRouter,
    amount,
    abi.encodeWithSelector(
        IUniswapV2Router.addLiquidity.selector,
        tokenA, tokenB, amountA, amountB, 0, 0, address(vault), deadline
    )
);
```

## Gas Optimization

The contract is optimized for gas efficiency:

- Uses `immutable` for constant values
- Efficient storage layout
- Minimal external calls
- Batch processing for withdrawals

## Upgradeability

The contract is not upgradeable by design for maximum security. Configuration changes are handled through parameter updates by the owner.

## License

MIT License - see LICENSE file for details.
