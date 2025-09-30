// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../predictionMarket/interfaces/IPredictionStructs.sol";
import "../predictionMarket/interfaces/IPredictionMarket.sol";
import "../predictionMarket/utils/SignatureProcessor.sol";
import "./interfaces/IPassiveLiquidityVault.sol";

/**
 * @title PassiveLiquidityVault
 * @notice An ERC-4626 semi-compliant passive liquidity vault that allows users to deposit assets and earn yield through EOA-managed protocol interactions
 *
 * HOW IT WORKS:
 * 1. Users request deposits by specifying assets and expected shares, with assets transferred immediately to the vault
 * 2. Users request withdrawals by specifying shares and expected assets, with no immediate transfer
 * 3. A designated EOA manager processes requests when market conditions are favorable (fair pricing)
 * 4. If requests expire (default 10 minutes) or conditions aren't favorable, users can cancel their requests
 * 5. Users must wait between requests (default 1 day) to prevent rapid-fire interactions
 * 6. The manager deploys vault funds to external protocols to generate yield while maintaining utilization limits
 * 7. Emergency mode allows immediate proportional withdrawals using only vault balance
 *
 * KEY FEATURES:
 * - ERC-4626 standard (semi-compliant) for DeFi interoperability
 * - Request-based deposit and withdrawal system with manager-controlled processing
 * - Utilization rate limits (default 80%) to control risk exposure
 * - Interaction delay (default 1 day) between user requests to prevent abuse
 * - Request expiration (default 10 minutes) with user cancellation capability
 * - Emergency mode for immediate proportional withdrawals during crises
 * - EOA manager can deploy/recall funds to any protocol with custom calldata
 * - Comprehensive access controls and safety mechanisms
 * - Custom errors for gas-efficient error handling
 *
 * @dev Implements utilization rate management, request-based deposit/withdrawal system, and EOA-controlled fund deployment with custom errors
 */
contract PassiveLiquidityVault is
    ERC4626,
    IPassiveLiquidityVault,
    Ownable2Step,
    ReentrancyGuard,
    Pausable,
    SignatureProcessor
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ Custom Errors ============

    // Non ERC-4626 compliant errors
    error NotImplemented();

    // Access control errors
    error OnlyManager(address caller, address expectedManager);
    error OnlyOwner(address caller, address owner);

    // Validation errors
    error InvalidAsset(address asset);
    error InvalidManager(address manager);
    error InvalidProtocol(address protocol);
    error InvalidAmount(uint256 amount);
    error InvalidShares(uint256 shares);
    error InvalidRate(uint256 rate, uint256 maxRate);
    error InvalidIndex(uint256 index, uint256 length);

    // State errors
    error EmergencyModeActive();
    error ProcessingInProgress(bool pendingRequests);
    error InsufficientBalance(
        address user,
        uint256 requested,
        uint256 available
    );
    error InsufficientAvailableAssets(uint256 requested, uint256 available);
    error ExceedsMaxUtilization(uint256 current, uint256 max);
    error AmountTooSmall(uint256 amount, uint256 minimum);

    // Queue errors
    error NoPendingRequests(address user);
    error NoPendingWithdrawal(address user);
    error NoPendingDeposit(address user);
    error PendingRequestNotProcessed(address user);
    error ProcessingRequestsInProgress();
    error TransferFailed(
        uint256 balanceBefore,
        uint256 amount,
        uint256 balanceAfter
    );
    error RequestNotExpired();
    error InteractionDelayNotExpired();

    // Emergency errors
    error EmergencyModeNotActive();

    // Additional errors
    error InvalidCaller();
    error RequestExpired();

    // ============ Events ============
    // Events are defined in the IPassiveLiquidityVault interface

    // ============ State Variables ============

    /// @notice The EOA manager who can deploy funds to other protocols
    address public manager;

    /// @notice Maximum utilization rate (in basis points, e.g., 8000 = 80%)
    uint256 public maxUtilizationRate = 8000; // 80%

    /// @notice Interaction delay in seconds between user requests (default: 1 day)
    uint256 public interactionDelay = 1 days;

    /// @notice Expiration time in seconds for user requests before they can be cancelled (default: 10 minutes)
    uint256 public expirationTime = 10 minutes;

    /// @notice Mapping of user to their last interaction timestamp (used to enforce interaction delay)
    mapping(address => uint256) public lastUserInteractionTimestamp;

    /// @notice Set of active protocol addresses
    EnumerableSet.AddressSet private activeProtocols;

    /// @notice Emergency mode flag
    bool public emergencyMode = false;

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Minimum deposit amount. Used also as min withdrawal amount unless available is less than minimum. A large enough amount to prevent DoS attacks on deposits or withdrawals
    uint256 public constant MIN_DEPOSIT = 100e18; // 100 token (assuming 18 decimals)

    /// @notice Default maximum utilization rate (80%)
    uint256 private constant DEFAULT_MAX_UTILIZATION_RATE = 8000;

    /// @notice Default interaction delay (1 day)
    uint256 private constant DEFAULT_INTERACTION_DELAY = 1 days;

    /// @notice Default expiration time (10 minutes)
    uint256 private constant DEFAULT_EXPIRATION_TIME = 2 minutes;

    /// @notice Total assets reserved for pending deposit requests
    uint256 private unconfirmedAssets = 0;

    /// @notice Mapping of user to their pending request (only one request per user at a time)
    mapping(address => PendingRequest) public pendingRequests;

    bool private processingRequests = false;

    // ============ Modifiers ============

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager(msg.sender, manager);
        _;
    }

    modifier notEmergency() {
        if (emergencyMode) revert EmergencyModeActive();
        _;
    }

    modifier notProcessingRequests() {
        if (processingRequests) revert ProcessingRequestsInProgress();
        processingRequests = true;
        _;
        processingRequests = false;
    }

    // ============ Constructor ============

    constructor(
        address _asset,
        address _manager,
        string memory _name,
        string memory _symbol
    )
        ERC4626(IERC20(_asset))
        ERC20(_name, _symbol)
        Ownable(msg.sender)
        SignatureProcessor()
    {
        if (_asset == address(0)) revert InvalidAsset(_asset);
        if (_manager == address(0)) revert InvalidManager(_manager);

        manager = _manager;
        maxUtilizationRate = DEFAULT_MAX_UTILIZATION_RATE;
        interactionDelay = DEFAULT_INTERACTION_DELAY;
        expirationTime = DEFAULT_EXPIRATION_TIME;
    }

    // ============ Custom totals, Withdrawal and Deposit Functions ============

    function availableAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function totalDeployed() external view returns (uint256) {
        return _deployedLiquidity();
    }

    function utilizationRate() external view returns (uint256) {
        uint256 deployedLiquidity = _deployedLiquidity();
        uint256 availableAssetsValue = availableAssets();
        uint256 totalAssetsValue = availableAssetsValue + deployedLiquidity;
        return
            totalAssetsValue > 0
                ? ((deployedLiquidity * BASIS_POINTS) / totalAssetsValue)
                : 0;
    }

    function _deployedLiquidity() internal view returns (uint256) {
        // get vault's owned NFTs and sum the collateral of each for each NFT
        uint256 totalDeployedAmount = 0;
        address[] memory protocols = activeProtocols.values();
        for (
            uint256 protocolIndex = 0;
            protocolIndex < protocols.length;
            protocolIndex++
        ) {
            address protocol = protocols[protocolIndex];
            IPredictionMarket pm = IPredictionMarket(protocol);
            uint256 userCollateralDeposits = pm.getUserCollateralDeposits(
                address(this)
            );
            totalDeployedAmount += userCollateralDeposits;
        }
        return totalDeployedAmount;
    }

    /**
     * @notice Request withdrawal of shares - creates a pending request that the manager can process
     * @param shares Number of shares to withdraw
     * @param expectedAssets Expected assets to receive (used for validation by manager)
     * @dev The request will expire after expirationTime and can be cancelled by the user
     */
    function requestWithdrawal(
        uint256 shares,
        uint256 expectedAssets
    ) external nonReentrant whenNotPaused {
        if (shares == 0) revert InvalidShares(shares);
        if (balanceOf(msg.sender) < shares)
            revert InsufficientBalance(
                msg.sender,
                shares,
                balanceOf(msg.sender)
            );
        if (
            lastUserInteractionTimestamp[msg.sender] + interactionDelay >
            block.timestamp
        ) revert InteractionDelayNotExpired();
        if (
            pendingRequests[msg.sender].user == msg.sender &&
            !pendingRequests[msg.sender].processed
        ) revert PendingRequestNotProcessed(msg.sender);

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        // Revert if withdrawal is small unless it's the full balance
        if (shares < balanceOf(msg.sender) && expectedAssets < MIN_DEPOSIT)
            revert AmountTooSmall(expectedAssets, MIN_DEPOSIT);

        pendingRequests[msg.sender] = IPassiveLiquidityVault.PendingRequest({
            user: msg.sender,
            isDeposit: false,
            shares: shares,
            assets: expectedAssets,
            timestamp: block.timestamp,
            processed: false
        });

        emit PendingRequestCreated(msg.sender, false, shares, expectedAssets);
    }

    /**
     * @notice Request deposit of assets - creates a pending request that the manager can process
     * @param assets Number of assets to deposit (transferred immediately to vault)
     * @param expectedShares Expected shares to receive (used for validation by manager)
     * @dev The request will expire after expirationTime and can be cancelled by the user
     */
    function requestDeposit(
        uint256 assets,
        uint256 expectedShares
    ) external nonReentrant whenNotPaused notEmergency {
        if (assets < MIN_DEPOSIT) revert AmountTooSmall(assets, MIN_DEPOSIT);
        if (
            lastUserInteractionTimestamp[msg.sender] + interactionDelay >
            block.timestamp
        ) revert InteractionDelayNotExpired();
        if (
            pendingRequests[msg.sender].user == msg.sender &&
            !pendingRequests[msg.sender].processed
        ) revert PendingRequestNotProcessed(msg.sender);

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        // Transfer assets from user to vault
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        if (balanceBefore + assets != balanceAfter)
            revert TransferFailed(balanceBefore, assets, balanceAfter);

        pendingRequests[msg.sender] = IPassiveLiquidityVault.PendingRequest({
            user: msg.sender,
            isDeposit: true,
            shares: expectedShares,
            assets: assets,
            timestamp: block.timestamp,
            processed: false
        });

        unconfirmedAssets += assets;

        emit PendingRequestCreated(msg.sender, true, expectedShares, assets);
    }

    /**
     * @notice Cancel a pending withdrawal request after expiration time
     * @dev Can only be called after the request has expired
     */
    function cancelWithdrawal() external nonReentrant {
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == address(0) || request.processed)
            revert NoPendingRequests(msg.sender);
        if (request.isDeposit) revert NoPendingWithdrawal(msg.sender);
        if (request.timestamp + expirationTime > block.timestamp)
            revert RequestNotExpired();

        request.user = address(0);

        emit PendingRequestCancelled(
            msg.sender,
            false,
            request.shares,
            request.assets
        );
    }

    /**
     * @notice Cancel a pending deposit request after expiration time
     * @dev Can only be called after the request has expired, returns assets to user
     */
    function cancelDeposit() external nonReentrant {
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == address(0) || request.processed)
            revert NoPendingRequests(msg.sender);
        if (!request.isDeposit) revert NoPendingDeposit(msg.sender);
        if (request.timestamp + expirationTime > block.timestamp)
            revert RequestNotExpired();

        // Store assets amount before clearing request
        uint256 assetsToReturn = request.assets;

        // Clear the request first to prevent reentrancy
        request.user = address(0);

        // Safely decrease unconfirmed assets with underflow protection
        if (unconfirmedAssets >= assetsToReturn) {
            unconfirmedAssets -= assetsToReturn;
        } else {
            // This should never happen in normal operation, but handle gracefully
            unconfirmedAssets = 0;
        }

        // Transfer assets from vault to user
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).safeTransfer(msg.sender, assetsToReturn);
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        if (balanceBefore != assetsToReturn + balanceAfter)
            revert TransferFailed(balanceBefore, assetsToReturn, balanceAfter);

        emit PendingRequestCancelled(
            msg.sender,
            true,
            request.shares,
            assetsToReturn
        );
    }

    /**
     * @notice Process a pending deposit request (manager only)
     * @param requestedBy Address of the user who made the deposit request
     * @dev Mints shares to the user and marks the request as processed
     */
    function processDeposit(
        address requestedBy
    ) external nonReentrant notProcessingRequests {
        // Check if the caller is the manager
        if (msg.sender != manager) revert OnlyManager(msg.sender, manager);

        PendingRequest storage request = pendingRequests[requestedBy];
        if (request.user == address(0) || request.processed)
            revert NoPendingRequests(requestedBy);
        if (!request.isDeposit) revert NoPendingDeposit(requestedBy);

        // Check if request has expired
        if (request.timestamp + expirationTime <= block.timestamp)
            revert RequestExpired();

        request.processed = true;
        unconfirmedAssets -= request.assets;

        _mint(requestedBy, request.shares);

        emit PendingRequestProcessed(
            requestedBy,
            true,
            request.shares,
            request.assets
        );
    }

    /**
     * @notice Process a pending withdrawal request (manager only)
     * @param requestedBy Address of the user who made the withdrawal request
     * @dev Burns shares and transfers assets to the user, marks request as processed
     */
    function processWithdrawal(
        address requestedBy
    ) external nonReentrant notProcessingRequests {
        // Check if the caller is the manager
        if (msg.sender != manager) revert OnlyManager(msg.sender, manager);

        PendingRequest storage request = pendingRequests[requestedBy];
        if (request.user == address(0) || request.processed)
            revert NoPendingRequests(requestedBy);
        if (request.isDeposit) revert NoPendingWithdrawal(requestedBy);

        // Check if request has expired
        if (request.timestamp + expirationTime <= block.timestamp)
            revert RequestExpired();

        request.processed = true;
        _burn(requestedBy, request.shares);

        // Transfer assets from vault to user
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).safeTransfer(request.user, request.assets);
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        if (balanceBefore != request.assets + balanceAfter)
            revert TransferFailed(balanceBefore, request.assets, balanceAfter);

        emit PendingRequestProcessed(
            requestedBy,
            false,
            request.shares,
            request.assets
        );
    }

    /**
     * @notice Emergency withdrawal (bypasses delay and uses proportional vault balance)
     * @param shares Number of shares to withdraw
     * @dev Only available in emergency mode, uses vault balance only (not deployed funds)
     */
    function emergencyWithdraw(
        uint256 shares
    ) external nonReentrant notProcessingRequests {
        if (!emergencyMode) revert EmergencyModeNotActive();
        if (shares == 0) revert InvalidShares(shares);
        if (balanceOf(msg.sender) < shares)
            revert InsufficientBalance(
                msg.sender,
                shares,
                balanceOf(msg.sender)
            );

        uint256 totalShares = totalSupply();
        if (totalShares == 0) revert InvalidShares(totalShares); // No shares issued yet

        // Convert shares to assets using just the vault's balance and not the total assets
        uint256 vaultBalance = _getAvailableAssets();
        if (vaultBalance == 0) revert InsufficientAvailableAssets(shares, 0);

        uint256 withdrawAmount = Math.mulDiv(
            shares,
            vaultBalance,
            totalShares,
            Math.Rounding.Floor
        );

        // Ensure we don't withdraw more than available
        if (withdrawAmount > vaultBalance)
            revert InsufficientAvailableAssets(withdrawAmount, vaultBalance);
        if (withdrawAmount == 0) revert AmountTooSmall(withdrawAmount, 1); // Prevent zero withdrawals

        _burn(msg.sender, shares);
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).safeTransfer(msg.sender, withdrawAmount);
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        if (balanceBefore != withdrawAmount + balanceAfter)
            revert TransferFailed(balanceBefore, withdrawAmount, balanceAfter);

        emit EmergencyWithdrawal(msg.sender, shares, withdrawAmount);
    }

    // ============ Manager Functions ============

    /**
     * @notice Approve funds usage to an external protocol
     * @param protocol Address of the target protocol (PredictionMarket)
     * @param amount Amount of assets to approve
     */
    function approveFundsUsage(
        address protocol,
        uint256 amount
    ) external onlyManager nonReentrant {
        if (protocol == address(0)) revert InvalidProtocol(protocol);
        if (amount == 0) revert InvalidAmount(amount);

        uint256 availableAssetsValue = _getAvailableAssets();
        if (amount > availableAssetsValue)
            revert InsufficientAvailableAssets(amount, availableAssetsValue);

        // Check utilization rate limits - cache values to avoid multiple calls
        uint256 deployedLiquidity = _deployedLiquidity();
        uint256 totalAssetsValue = availableAssetsValue + deployedLiquidity;
        uint256 newUtilization = ((deployedLiquidity + amount) * BASIS_POINTS) /
            totalAssetsValue;
        if (newUtilization > maxUtilizationRate)
            revert ExceedsMaxUtilization(newUtilization, maxUtilizationRate);

        // Update deployment info - use EnumerableSet for gas efficiency
        activeProtocols.add(protocol);

        IERC20(asset()).forceApprove(protocol, amount);

        emit FundsApproved(msg.sender, amount, protocol);

        // Calculate current utilization for event (avoid external call)
        uint256 currentUtilization = totalAssetsValue > 0
            ? ((deployedLiquidity * BASIS_POINTS) / totalAssetsValue)
            : 0;
        emit UtilizationRateUpdated(currentUtilization, newUtilization);
    }

    // ============ Signature Functions ============

    function isValidSignature(
        bytes32 messageHash,
        bytes memory signature
    ) external view returns (bytes4) {
        // check if the signer was the manager
        if (_isApprovalValid(messageHash, manager, signature)) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xFFFFFFFF;
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
     * @notice Get number of active protocols
     * @return Number of active protocols
     */
    function getActiveProtocolsCount() external view returns (uint256) {
        return activeProtocols.length();
    }

    function getActiveProtocols() external view returns (address[] memory) {
        return activeProtocols.values();
    }

    /**
     * @notice Get active protocol by index
     * @param index Index in active protocols array
     * @return protocol Protocol address
     */
    function getActiveProtocol(uint256 index) external view returns (address) {
        return activeProtocols.at(index);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set new manager
     * @param newManager Address of new manager
     */
    function setManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert InvalidManager(newManager);
        address oldManager = manager;
        manager = newManager;
        emit ManagerUpdated(oldManager, newManager);
    }

    /**
     * @notice Set maximum utilization rate
     * @param newMaxRate New maximum utilization rate (in basis points)
     */
    function setMaxUtilizationRate(uint256 newMaxRate) external onlyOwner {
        if (newMaxRate > BASIS_POINTS)
            revert InvalidRate(newMaxRate, BASIS_POINTS);
        uint256 oldRate = maxUtilizationRate;
        maxUtilizationRate = newMaxRate;
        emit UtilizationRateUpdated(oldRate, newMaxRate);
    }

    /**
     * @notice Set interaction delay between user requests
     * @param newDelay New interaction delay in seconds
     */
    function setInteractionDelay(uint256 newDelay) external onlyOwner {
        uint256 oldDelay = interactionDelay;
        interactionDelay = newDelay;
        emit InteractionDelayUpdated(oldDelay, newDelay);
    }

    /**
     * @notice Set expiration time for user requests
     * @param newExpirationTime New expiration time in seconds (after which requests can be cancelled)
     */
    function setExpirationTime(uint256 newExpirationTime) external onlyOwner {
        uint256 oldExpirationTime = expirationTime;
        expirationTime = newExpirationTime;
        emit ExpirationTimeUpdated(oldExpirationTime, newExpirationTime);
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



    // ============ ERC-4626 Overrides ============

    /**
     * @notice ERC-4626 COMPLIANCE NOTICE:
     *
     * This vault intentionally deviates from the ERC-4626 standard to implement a request-based
     * deposit/withdrawal system with manager-controlled processing. The standard ERC-4626 functions
     * are overridden to revert with NotImplemented() to prevent direct usage.
     *
     * DEVIATION RATIONALE:
     * 1. Request-based System: Users create requests that are processed by a manager when conditions
     *    are favorable, rather than immediate execution as required by ERC-4626.
     * 2. Manager Control: A designated manager controls when deposits/withdrawals are processed,
     *    allowing for better risk management and fair pricing.
     * 3. Request Expiration: Requests can expire and be cancelled, providing users with an escape
     *    mechanism if conditions change.
     * 4. Interaction Delays: Users must wait between requests to prevent abuse and rapid-fire
     *    interactions that could destabilize the vault.
     *
     * ALTERNATIVE INTERFACE:
     * - Use requestDeposit(assets, expectedShares) instead of deposit()
     * - Use requestWithdrawal(shares, expectedAssets) instead of withdraw()
     * - Use emergencyWithdraw(shares) for immediate withdrawals in emergency mode
     * - Use availableAssets() and totalDeployed() instead of totalAssets()
     *
     * COMPATIBILITY:
     * While not ERC-4626 compliant, this vault maintains ERC-20 compliance for the share token
     * and provides similar functionality through the request-based interface.
     */

    function deposit(
        uint256 /* assets */,
        address /* receiver */
    ) public override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function mint(
        uint256 /* shares */,
        address /* receiver */
    ) public override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function withdraw(
        uint256 /* assets */,
        address /* receiver */,
        address /* owner */
    ) public override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function redeem(
        uint256 /* shares */,
        address /* receiver */,
        address /* owner */
    ) public override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function totalAssets()
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256)
    {
        revert NotImplemented();
    }

    function previewDeposit(
        uint256 /* assets */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function previewMint(
        uint256 /* shares */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function previewWithdraw(
        uint256 /* assets */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function previewRedeem(
        uint256 /* shares */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function maxDeposit(
        address /* receiver */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function maxMint(
        address /* receiver */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function maxWithdraw(
        address /* owner */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }

    function maxRedeem(
        address /* owner */
    ) public view override(ERC4626, IERC4626) returns (uint256) {
        revert NotImplemented();
    }


}
