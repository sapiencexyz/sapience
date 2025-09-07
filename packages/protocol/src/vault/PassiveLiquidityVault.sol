// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title PassiveLiquidityVault
 * @notice An ERC-4626 compliant passive liquidity vault that allows users to deposit assets and earn yield through EOA-managed protocol interactions
 * 
 * HOW IT WORKS:
 * 1. Users deposit ERC-20 tokens and receive vault shares (1:1 initially)
 * 2. A designated EOA manager deploys vault funds to external protocols (lending, DEXs, etc.) to generate yield
 * 3. Users can request withdrawals, which are queued with a configurable delay to prevent bank runs
 * 4. Withdrawals are processed when liquidity is available, maintaining fair first-come-first-served order
 * 5. The vault tracks utilization rate to prevent over-leverage and includes emergency mechanisms
 * 
 * KEY FEATURES:
 * - ERC-4626 standard compliance for maximum DeFi interoperability
 * - Utilization rate limits (default 80%) to control risk exposure
 * - Withdrawal queue with delay (default 1 day) to manage liquidity
 * - Emergency mode for immediate withdrawals during crises
 * - EOA manager can deploy/recall funds to any protocol with custom calldata
 * - Comprehensive access controls and safety mechanisms
 * 
 * @dev Implements utilization rate management, withdrawal queue, and EOA-controlled fund deployment
 */
contract PassiveLiquidityVault is ERC4626, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ============ Events ============
    
    event WithdrawalRequested(address indexed user, uint256 shares, uint256 queuePosition);
    event WithdrawalProcessed(address indexed user, uint256 shares, uint256 amount);
    event FundsDeployed(address indexed manager, uint256 amount, address targetProtocol);
    event FundsRecalled(address indexed manager, uint256 amount, address targetProtocol);
    event UtilizationRateUpdated(uint256 oldRate, uint256 newRate);
    event EmergencyWithdrawal(address indexed user, uint256 shares, uint256 amount);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event MaxUtilizationRateUpdated(uint256 oldRate, uint256 newRate);
    event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);

    // ============ Structs ============
    
    struct WithdrawalRequest {
        address user;
        uint256 shares;
        uint256 timestamp;
        bool processed;
    }

    struct DeploymentInfo {
        address protocol;
        uint256 amount;
        uint256 timestamp;
        bool active;
    }

    // ============ State Variables ============
    
    /// @notice The EOA manager who can deploy funds to other protocols
    address public manager;
    
    /// @notice Maximum utilization rate (in basis points, e.g., 8000 = 80%)
    uint256 public maxUtilizationRate = 8000; // 80%
    
    /// @notice Current utilization rate (in basis points)
    uint256 public utilizationRate = 0;
    
    /// @notice Withdrawal delay in seconds (default: 1 day)
    uint256 public withdrawalDelay = 1 days;
    
    /// @notice Total assets deployed to external protocols
    uint256 public totalDeployed;
    
    /// @notice Withdrawal queue
    WithdrawalRequest[] public withdrawalQueue;
    
    /// @notice Mapping of user to their withdrawal request index
    mapping(address => uint256) public userWithdrawalIndex;
    
    /// @notice Mapping of protocol addresses to deployment info
    mapping(address => DeploymentInfo) public deployments;
    
    /// @notice List of active protocol addresses
    address[] public activeProtocols;
    
    /// @notice Mapping to check if protocol is in active list
    mapping(address => bool) public isActiveProtocol;
    
    /// @notice Emergency mode flag
    bool public emergencyMode = false;
    
    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BASIS_POINTS = 10000;
    
    /// @notice Minimum deposit amount
    uint256 public constant MIN_DEPOSIT = 1e6; // 1 token (assuming 6 decimals)

    // ============ Modifiers ============
    
    modifier onlyManager() {
        require(msg.sender == manager, "Only manager");
        _;
    }
    
    modifier notEmergency() {
        require(!emergencyMode, "Emergency mode active");
        _;
    }

    // ============ Constructor ============
    
    constructor(
        address _asset,
        address _manager,
        string memory _name,
        string memory _symbol
    ) ERC4626(IERC20(_asset)) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_asset != address(0), "Invalid asset");
        require(_manager != address(0), "Invalid manager");
        
        manager = _manager;
    }

    // ============ ERC-4626 Overrides ============
    
    /**
     * @notice Override deposit to add custom logic
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Number of shares minted
     */
    function deposit(uint256 assets, address receiver) public override nonReentrant whenNotPaused notEmergency returns (uint256 shares) {
        require(assets >= MIN_DEPOSIT, "Amount too small");
        return super.deposit(assets, receiver);
    }

    /**
     * @notice Override mint to add custom logic
     * @param shares Number of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     */
    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused notEmergency returns (uint256 assets) {
        assets = previewMint(shares);
        require(assets >= MIN_DEPOSIT, "Amount too small");
        return super.mint(shares, receiver);
    }

    /**
     * @notice Override withdraw to use withdrawal queue instead of immediate withdrawal
     * @param assets Amount of assets to withdraw
     * @param owner Address that owns the shares
     * @return shares Number of shares burned
     */
    function withdraw(uint256 assets, address /* receiver */, address owner) public override nonReentrant whenNotPaused returns (uint256 shares) {
        shares = previewWithdraw(assets);
        _requestWithdrawal(shares, owner);
        return shares;
    }

    /**
     * @notice Override redeem to use withdrawal queue instead of immediate withdrawal
     * @param shares Number of shares to redeem
     * @param owner Address that owns the shares
     * @return assets Amount of assets withdrawn
     */
    function redeem(uint256 shares, address /* receiver */, address owner) public override nonReentrant whenNotPaused returns (uint256 assets) {
        assets = previewRedeem(shares);
        _requestWithdrawal(shares, owner);
        return assets;
    }

    /**
     * @notice Override totalAssets to include deployed funds
     * @return Total assets (available + deployed)
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalDeployed;
    }

    // ============ Custom Withdrawal Functions ============
    
    /**
     * @notice Request withdrawal of shares (internal function used by withdraw/redeem)
     * @param shares Number of shares to withdraw
     * @param owner Address that owns the shares
     * @return queuePosition Position in withdrawal queue
     */
    function _requestWithdrawal(uint256 shares, address owner) internal returns (uint256 queuePosition) {
        require(shares > 0, "Invalid shares");
        require(balanceOf(owner) >= shares, "Insufficient balance");
        require(userWithdrawalIndex[owner] == 0, "Withdrawal already pending");
        
        // Burn shares immediately
        _burn(owner, shares);
        
        // Add to withdrawal queue
        withdrawalQueue.push(WithdrawalRequest({
            user: owner,
            shares: shares,
            timestamp: block.timestamp,
            processed: false
        }));
        
        queuePosition = withdrawalQueue.length - 1;
        userWithdrawalIndex[owner] = queuePosition + 1; // 1-indexed
        
        emit WithdrawalRequested(owner, shares, queuePosition);
    }

    /**
     * @notice Request withdrawal of shares (public function for direct calls)
     * @param shares Number of shares to withdraw
     * @return queuePosition Position in withdrawal queue
     */
    function requestWithdrawal(uint256 shares) public returns (uint256 queuePosition) {
        return _requestWithdrawal(shares, msg.sender);
    }

    /**
     * @notice Process withdrawal requests (can be called by anyone)
     * @param maxRequests Maximum number of requests to process in this call
     */
    function processWithdrawals(uint256 maxRequests) external nonReentrant {
        uint256 processed = 0;
        uint256 availableAssets = _getAvailableAssets();
        
        for (uint256 i = 0; i < withdrawalQueue.length && processed < maxRequests; i++) {
            WithdrawalRequest storage request = withdrawalQueue[i];
            
            if (request.processed || block.timestamp < request.timestamp + withdrawalDelay) {
                continue;
            }
            
            uint256 withdrawAmount = _convertToAssets(request.shares, Math.Rounding.Floor);
            
            if (withdrawAmount > availableAssets) {
                break; // Not enough liquidity
            }
            
            // Process withdrawal
            request.processed = true;
            availableAssets -= withdrawAmount;
            
            // Reset user withdrawal index
            userWithdrawalIndex[request.user] = 0;
            
            // Transfer assets to user
            IERC20(asset()).safeTransfer(request.user, withdrawAmount);
            
            emit WithdrawalProcessed(request.user, request.shares, withdrawAmount);
            processed++;
        }
    }

    /**
     * @notice Emergency withdrawal (bypasses queue and delay)
     * @param shares Number of shares to withdraw
     */
    function emergencyWithdraw(uint256 shares) external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        require(shares > 0, "Invalid shares");
        require(balanceOf(msg.sender) >= shares, "Insufficient balance");
        
        uint256 withdrawAmount = _convertToAssets(shares, Math.Rounding.Floor);
        require(withdrawAmount <= _getAvailableAssets(), "Insufficient liquidity");
        
        _burn(msg.sender, shares);
        IERC20(asset()).safeTransfer(msg.sender, withdrawAmount);
        
        emit EmergencyWithdrawal(msg.sender, shares, withdrawAmount);
    }

    // ============ Manager Functions ============
    
    /**
     * @notice Deploy funds to an external protocol
     * @param protocol Address of the target protocol
     * @param amount Amount of assets to deploy
     * @param data Calldata for the protocol interaction
     */
    function deployFunds(address protocol, uint256 amount, bytes calldata data) external onlyManager nonReentrant {
        require(protocol != address(0), "Invalid protocol");
        require(amount > 0, "Invalid amount");
        require(amount <= _getAvailableAssets(), "Insufficient available assets");
        
        // Check utilization rate limits
        uint256 newUtilization = ((totalDeployed + amount) * BASIS_POINTS) / totalAssets();
        require(newUtilization <= maxUtilizationRate, "Exceeds max utilization");
        
        // Update deployment info
        if (!isActiveProtocol[protocol]) {
            activeProtocols.push(protocol);
            isActiveProtocol[protocol] = true;
        }
        
        deployments[protocol] = DeploymentInfo({
            protocol: protocol,
            amount: deployments[protocol].amount + amount,
            timestamp: block.timestamp,
            active: true
        });
        
        totalDeployed += amount;
        utilizationRate = newUtilization;
        
        // Transfer assets to protocol
        IERC20(asset()).safeTransfer(protocol, amount);
        
        // Call protocol function if data provided
        if (data.length > 0) {
            (bool success, ) = protocol.call(data);
            require(success, "Protocol call failed");
        }
        
        emit FundsDeployed(msg.sender, amount, protocol);
        emit UtilizationRateUpdated(utilizationRate, newUtilization);
    }

    /**
     * @notice Recall funds from an external protocol
     * @param protocol Address of the protocol to recall from
     * @param amount Amount of assets to recall
     * @param data Calldata for the protocol interaction
     */
    function recallFunds(address protocol, uint256 amount, bytes calldata data) external onlyManager nonReentrant {
        require(protocol != address(0), "Invalid protocol");
        require(amount > 0, "Invalid amount");
        require(deployments[protocol].amount >= amount, "Insufficient deployed amount");
        
        // Call protocol function if data provided
        if (data.length > 0) {
            (bool success, ) = protocol.call(data);
            require(success, "Protocol call failed");
        }
        
        // Update deployment info
        deployments[protocol].amount -= amount;
        totalDeployed -= amount;
        
        // Remove from active protocols if fully recalled
        if (deployments[protocol].amount == 0) {
            deployments[protocol].active = false;
            _removeActiveProtocol(protocol);
        }
        
        // Update utilization rate
        uint256 newUtilization = totalAssets() > 0 ? (totalDeployed * BASIS_POINTS) / totalAssets() : 0;
        utilizationRate = newUtilization;
        
        emit FundsRecalled(msg.sender, amount, protocol);
        emit UtilizationRateUpdated(utilizationRate, newUtilization);
    }

    // ============ View Functions ============
    
    /**
     * @notice Get available assets for withdrawals
     * @return Available assets
     */
    function _getAvailableAssets() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /**
     * @notice Get pending withdrawal amount for a user
     * @param user User address
     * @return amount Pending withdrawal amount
     */
    function getPendingWithdrawal(address user) external view returns (uint256 amount) {
        uint256 index = userWithdrawalIndex[user];
        if (index == 0) return 0;
        
        WithdrawalRequest storage request = withdrawalQueue[index - 1];
        if (request.processed) return 0;
        
        return _convertToAssets(request.shares, Math.Rounding.Floor);
    }

    /**
     * @notice Get withdrawal queue length
     * @return Length of withdrawal queue
     */
    function getWithdrawalQueueLength() external view returns (uint256) {
        return withdrawalQueue.length;
    }

    /**
     * @notice Get withdrawal request by index
     * @param index Index in withdrawal queue
     * @return request Withdrawal request data
     */
    function getWithdrawalRequest(uint256 index) external view returns (WithdrawalRequest memory) {
        require(index < withdrawalQueue.length, "Invalid index");
        return withdrawalQueue[index];
    }

    /**
     * @notice Get number of active protocols
     * @return Number of active protocols
     */
    function getActiveProtocolsCount() external view returns (uint256) {
        return activeProtocols.length;
    }

    /**
     * @notice Get active protocol by index
     * @param index Index in active protocols array
     * @return protocol Protocol address
     */
    function getActiveProtocol(uint256 index) external view returns (address) {
        require(index < activeProtocols.length, "Invalid index");
        return activeProtocols[index];
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Set new manager
     * @param newManager Address of new manager
     */
    function setManager(address newManager) external onlyOwner {
        require(newManager != address(0), "Invalid manager");
        address oldManager = manager;
        manager = newManager;
        emit ManagerUpdated(oldManager, newManager);
    }

    /**
     * @notice Set maximum utilization rate
     * @param newMaxRate New maximum utilization rate (in basis points)
     */
    function setMaxUtilizationRate(uint256 newMaxRate) external onlyOwner {
        require(newMaxRate <= BASIS_POINTS, "Invalid rate");
        uint256 oldRate = maxUtilizationRate;
        maxUtilizationRate = newMaxRate;
        emit MaxUtilizationRateUpdated(oldRate, newMaxRate);
    }

    /**
     * @notice Set withdrawal delay
     * @param newDelay New withdrawal delay in seconds
     */
    function setWithdrawalDelay(uint256 newDelay) external onlyOwner {
        uint256 oldDelay = withdrawalDelay;
        withdrawalDelay = newDelay;
        emit WithdrawalDelayUpdated(oldDelay, newDelay);
    }

    /**
     * @notice Toggle emergency mode
     */
    function toggleEmergencyMode() external onlyOwner {
        emergencyMode = !emergencyMode;
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal Functions ============
    
    /**
     * @notice Remove protocol from active protocols list
     * @param protocol Protocol address to remove
     */
    function _removeActiveProtocol(address protocol) internal {
        for (uint256 i = 0; i < activeProtocols.length; i++) {
            if (activeProtocols[i] == protocol) {
                activeProtocols[i] = activeProtocols[activeProtocols.length - 1];
                activeProtocols.pop();
                isActiveProtocol[protocol] = false;
                break;
            }
        }
    }
}