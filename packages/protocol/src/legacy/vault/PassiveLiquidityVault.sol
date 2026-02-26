// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../predictionMarket/interfaces/IPredictionMarket.sol";
import "../predictionMarket/utils/SignatureProcessor.sol";
import "./interfaces/IPassiveLiquidityVault.sol";

/**
 * @title PassiveLiquidityVault
 * @notice A passive liquidity vault that allows users to deposit assets and earn yield through EOA-managed protocol interactions
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
    ERC20,
    IPassiveLiquidityVault,
    Ownable2Step,
    ReentrancyGuard,
    Pausable,
    SignatureProcessor,
    IERC721Receiver,
    ERC165
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ Vault ============
    IERC20 private immutable _asset;
    uint8 private immutable _underlyingDecimals;

    // ============ Default Values ============

    uint256 private constant DEFAULT_MAX_UTILIZATION_RATE = 0.8e18; // 80% in WAD
    uint256 private constant DEFAULT_INTERACTION_DELAY = 1 days;
    uint256 private constant DEFAULT_EXPIRATION_TIME = 10 minutes;

    // ============ Custom Errors ============

    // Access control errors
    error OnlyManager(address caller, address expectedManager);

    // Validation errors
    error InvalidAsset(address asset);
    error InvalidManager(address manager);
    error InvalidProtocol(address protocol);
    error InvalidAmount(uint256 amount);
    error InvalidShares(uint256 shares);
    error InvalidRate(uint256 rate, uint256 maxRate);

    // State errors
    error EmergencyModeActive();
    error InsufficientBalance(
        address user,
        uint256 requested,
        uint256 available
    );
    error InsufficientAvailableAssets(uint256 requested, uint256 available);
    error ExceedsMaxUtilization(uint256 current, uint256 max);

    // Queue errors
    error NoPendingRequests(address user);
    error NoPendingWithdrawal(address user);
    error NoPendingDeposit(address user);
    error PendingRequestNotProcessed(address user);
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
    error RequestExpired();
    error SharesLockedForWithdrawal(address user, uint256 lockedShares, uint256 attemptedTransfer);

    // ============ Events ============
    // Events are defined in the IPassiveLiquidityVault interface

    // ============ State Variables ============

    /// @notice The EOA manager who can deploy funds to other protocols
    address public manager;

    /// @notice Maximum utilization rate (in WAD, e.g., 0.8e18 = 80%)
    uint256 public maxUtilizationRate = DEFAULT_MAX_UTILIZATION_RATE; // 80%

    /// @notice Interaction delay in seconds between user requests (default: 1 day)
    uint256 public interactionDelay = DEFAULT_INTERACTION_DELAY; // 1 day

    /// @notice Expiration time in seconds for user requests before they can be cancelled (default: 10 minutes)
    uint256 public expirationTime = DEFAULT_EXPIRATION_TIME; // 10 minutes

    /// @notice Mapping of user to their last interaction timestamp (used to enforce interaction delay)
    mapping(address => uint256) public lastUserInteractionTimestamp;

    /// @notice Set of active protocol addresses
    EnumerableSet.AddressSet private activeProtocols;

    /// @notice Emergency mode flag
    bool public emergencyMode = false;

    /// @notice WAD denominator for high-precision calculations (1e18 = 100%)
    uint256 public constant WAD = 1e18;

    /// @notice Total assets reserved for pending deposit requests
    uint256 private unconfirmedAssets = 0;

    /// @notice Mapping of user to their pending request (only one request per user at a time)
    mapping(address => PendingRequest) public pendingRequests;

    // ============ Modifiers ============

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager(msg.sender, manager);
        _;
    }

    modifier notEmergency() {
        if (emergencyMode) revert EmergencyModeActive();
        _;
    }

    // ============ Constructor ============

    constructor(
        address asset_,
        address _manager,
        string memory _name,
        string memory _symbol
    )
        ERC20(_name, _symbol)
        Ownable(msg.sender)
    {
        if (asset_ == address(0)) revert InvalidAsset(asset_);
        if (_manager == address(0)) revert InvalidManager(_manager);

        _asset = IERC20(asset_);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(_asset);
        _underlyingDecimals = success ? assetDecimals : 18;

        manager = _manager;
    }

    /**
     * @dev Attempts to fetch the asset decimals. A return value of false indicates that the attempt failed in some way.
     */
    function _tryGetAssetDecimals(IERC20 asset_) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        if (success && encodedDecimals.length >= 32) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            if (returnedDecimals <= type(uint8).max) {
                return (true, uint8(returnedDecimals));
            }
        }
        return (false, 0);
    }

    // ============ Custom totals, Withdrawal and Deposit Functions ============
    /**
     * @dev Returns the number of decimals of the underlying asset. This value is fetched and cached during
     * construction of the vault contract. If the decimals() call fails during construction (e.g., the asset
     * contract does not implement decimals()), a default of 18 is used.
     *
     * See {IERC20Metadata-decimals}.
     */
    function decimals() public view virtual override returns (uint8) {
        return _underlyingDecimals;
    }

    /** @dev See {IERC20-asset}. */
    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    function availableAssets() public view returns (uint256) {
        uint256 balance = _asset.balanceOf(address(this));
        // Subtract unconfirmed assets (pending deposit requests)
        return balance > unconfirmedAssets ? balance - unconfirmedAssets : 0;
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
                ? ((deployedLiquidity * WAD) / totalAssetsValue)
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

    function _getDeploymentAndApprovalsWithCleanup(address excludeProtocol) internal returns (uint256, uint256) {
        // Calculate deployed liquidity and total approvals in a single loop, cleanup inactive protocols
        // Returns: (totalDeployedAmount, totalCurrentApprovals excluding excludeProtocol)
        uint256 totalDeployedAmount = 0;
        uint256 totalCurrentApprovals = 0;
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
            uint256 allowance = _asset.allowance(address(this), protocol);
            
            // Remove protocol only if both deposits and allowance are zero
            if (userCollateralDeposits == 0 && allowance == 0) {
                activeProtocols.remove(protocol);
            }
            
            totalDeployedAmount += userCollateralDeposits;
            
            // Add to total approvals if not the excluded protocol
            if (protocol != excludeProtocol) {
                totalCurrentApprovals += allowance;
            }
        }
        return (totalDeployedAmount, totalCurrentApprovals);
    }

    /**
     * @notice Reconcile protocol allowances against current utilization constraints
     * @dev Caps or zeroes allowances so that total approvals do not exceed the allowed utilization headroom
     *      Allowed approvals headroom = floor(maxUtilizationRate * (available + deployed)) - deployed
     *      If total assets are zero, all allowances are set to zero
     */
    function _reconcileApprovals() internal {
        // Get current active protocols snapshot
        address[] memory protocols = activeProtocols.values();

        // Compute currently deployed liquidity
        uint256 deployedLiquidity = 0;
        for (
            uint256 protocolIndex = 0;
            protocolIndex < protocols.length;
            protocolIndex++
        ) {
            IPredictionMarket pm = IPredictionMarket(protocols[protocolIndex]);
            uint256 userCollateralDeposits = pm.getUserCollateralDeposits(
                address(this)
            );
            deployedLiquidity += userCollateralDeposits;
        }

        // Available assets exclude unconfirmed deposits
        uint256 availableAssetsValue = _getAvailableAssets();
        uint256 totalAssetsValue = availableAssetsValue + deployedLiquidity;

        // If nothing is left, zero out all allowances and clean up
        if (totalAssetsValue == 0) {
            for (
                uint256 i = 0;
                i < protocols.length;
                i++
            ) {
                address protocolToZero = protocols[i];
                uint256 currentAllowance = _asset.allowance(address(this), protocolToZero);
                if (currentAllowance > 0) {
                    _asset.forceApprove(protocolToZero, 0);
                }
            }
            // Cleanup inactive protocols where both deposits and allowance are zero
            _getDeploymentAndApprovalsWithCleanup(address(0));
            return;
        }

        // Compute maximum approvals allowed by utilization
        // approvalsHeadroom = floor(maxUtilizationRate * totalAssets) - deployed
        uint256 maxUtilizationAssets = (maxUtilizationRate * totalAssetsValue) / WAD;
        uint256 approvalsHeadroom = maxUtilizationAssets > deployedLiquidity
            ? maxUtilizationAssets - deployedLiquidity
            : 0;

        // Reduce allowances so that the aggregate across protocols does not exceed approvalsHeadroom
        uint256 remainingHeadroom = approvalsHeadroom;
        for (
            uint256 protocolIndex = 0;
            protocolIndex < protocols.length;
            protocolIndex++
        ) {
            address protocol = protocols[protocolIndex];
            uint256 currentAllowance = _asset.allowance(address(this), protocol);
            if (currentAllowance == 0) continue;

            uint256 newAllowance = currentAllowance <= remainingHeadroom
                ? currentAllowance
                : remainingHeadroom;

            if (newAllowance != currentAllowance) {
                _asset.forceApprove(protocol, newAllowance);
            }

            // Decrease remaining headroom by the allowance we kept for this protocol
            if (remainingHeadroom > newAllowance) {
                remainingHeadroom -= newAllowance;
            } else {
                remainingHeadroom = 0;
            }
        }

        // Cleanup protocols with zero deposits and zero allowance
        _getDeploymentAndApprovalsWithCleanup(address(0));
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
    ) external nonReentrant whenNotPaused notEmergency {
        if (shares == 0) revert InvalidShares(shares);
        if (expectedAssets == 0) revert InvalidAmount(expectedAssets);

        uint256 balance = balanceOf(msg.sender);
        if (balance < shares)
            revert InsufficientBalance(
                msg.sender,
                shares,
                balance
            );
        if (
            lastUserInteractionTimestamp[msg.sender] > 0 &&
            lastUserInteractionTimestamp[msg.sender] + interactionDelay >
            block.timestamp
        ) revert InteractionDelayNotExpired();

        PendingRequest storage request = pendingRequests[msg.sender];
        if (
            request.user == msg.sender &&
            !request.processed
        ) revert PendingRequestNotProcessed(msg.sender);

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        pendingRequests[msg.sender] = IPassiveLiquidityVault.PendingRequest({
            shares: shares,
            assets: expectedAssets,
            timestamp: uint64(block.timestamp),
            user: msg.sender,
            isDeposit: false,
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
        if (assets == 0) revert InvalidAmount(assets);
        if (expectedShares == 0) revert InvalidShares(expectedShares);
        if (
            lastUserInteractionTimestamp[msg.sender] > 0 &&
            lastUserInteractionTimestamp[msg.sender] + interactionDelay >
            block.timestamp
        ) revert InteractionDelayNotExpired();
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == msg.sender && !request.processed)
            revert PendingRequestNotProcessed(msg.sender);

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        // Transfer assets from user to vault
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore + assets != balanceAfter)
            revert TransferFailed(balanceBefore, assets, balanceAfter);

        pendingRequests[msg.sender] = IPassiveLiquidityVault.PendingRequest({
            shares: expectedShares,
            assets: assets,
            timestamp: uint64(block.timestamp),
            user: msg.sender,
            isDeposit: true,
            processed: false
        });

        unconfirmedAssets += assets;

        emit PendingRequestCreated(msg.sender, true, expectedShares, assets);
    }

    /**
     * @notice Cancel a pending withdrawal request after expiration time
     * @dev Can only be called after the request has expired
     */
    function cancelWithdrawal() external nonReentrant whenNotPaused {
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == address(0) || request.processed)
            revert NoPendingRequests(msg.sender);
        if (request.isDeposit) revert NoPendingWithdrawal(msg.sender);
        if (request.timestamp + expirationTime > block.timestamp)
            revert RequestNotExpired();

        request.user = address(0);

        // Reset the interaction timestamp to allow user to post a new request after the a request has expired (most likely due to volatility)
        lastUserInteractionTimestamp[msg.sender] = 0; 

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
    function cancelDeposit() external nonReentrant whenNotPaused {
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

        // Decrease unconfirmed assets 
        unconfirmedAssets -= assetsToReturn;

        // Transfer assets from vault to user
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransfer(msg.sender, assetsToReturn);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore != assetsToReturn + balanceAfter)
            revert TransferFailed(balanceBefore, assetsToReturn, balanceAfter);

        // Reset the interaction timestamp to allow user to post a new request after the a request has expired (most likely due to volatility)
        lastUserInteractionTimestamp[msg.sender] = 0; 

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
    ) external nonReentrant onlyManager {
        _processDeposit(requestedBy);
    }

    /**
     * @notice Batch process multiple pending deposit requests (manager only)
     * @param requesters Array of addresses who made deposit requests
     * @dev Processes each deposit request, reverts if any request fails
     */
    function batchProcessDeposit(
        address[] calldata requesters
    ) external nonReentrant onlyManager {
        for (uint256 i = 0; i < requesters.length; i++) {
            _processDeposit(requesters[i]);
        }
    }


    function _processDeposit(
        address requestedBy
    ) internal {    
        PendingRequest storage request = pendingRequests[requestedBy];
        
        // Check for no pending request
        if (request.user == address(0) || request.processed) {
            revert NoPendingRequests(requestedBy);
        }
        
        // Check for wrong request type
        if (!request.isDeposit) {
            revert NoPendingDeposit(requestedBy);
        }

        // Check if request has expired
        if (request.timestamp + expirationTime <= block.timestamp) {
            revert RequestExpired();
        }

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
    ) external nonReentrant onlyManager {
        _processWithdrawal(requestedBy);
    }

    /**
     * @notice Batch process multiple pending withdrawal requests (manager only)
     * @param requesters Array of addresses who made withdrawal requests
     * @dev Processes each withdrawal request, reverts if any request fails
     */
    function batchProcessWithdrawal(
        address[] calldata requesters
    ) external nonReentrant onlyManager {
        for (uint256 i = 0; i < requesters.length; i++) {
            _processWithdrawal(requesters[i]);
        }
    }

    function _processWithdrawal(
        address requestedBy
    ) internal {
        PendingRequest storage request = pendingRequests[requestedBy];
        
        // Check for no pending request
        if (request.user == address(0) || request.processed) {
            revert NoPendingRequests(requestedBy);
        }
        
        // Check for wrong request type
        if (request.isDeposit) {
            revert NoPendingWithdrawal(requestedBy);
        }

        // Check if request has expired
        if (request.timestamp + expirationTime <= block.timestamp) {
            revert RequestExpired();
        }

        request.processed = true;
        _burn(requestedBy, request.shares);

        // Transfer assets from vault to user
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransfer(request.user, request.assets);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore != request.assets + balanceAfter) {
            revert TransferFailed(balanceBefore, request.assets, balanceAfter);
        }

        // After a withdrawal, reconcile approvals to keep utilization within bounds
        _reconcileApprovals();

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
    ) external nonReentrant {
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
        if (withdrawAmount == 0) revert InvalidAmount(withdrawAmount); // Prevent zero withdrawals

        _burn(msg.sender, shares);
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransfer(msg.sender, withdrawAmount);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore != withdrawAmount + balanceAfter)
            revert TransferFailed(balanceBefore, withdrawAmount, balanceAfter);

        emit EmergencyWithdrawal(msg.sender, shares, withdrawAmount);
    }

    /**
     * @notice Override ERC20 _update to prevent transfers of shares locked for withdrawal
     * @param from Address sending tokens (address(0) for minting)
     * @param to Address receiving tokens (address(0) for burning)
     * @param value Amount of tokens being transferred
     * @dev Prevents users from transferring shares that are locked in pending withdrawal requests
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        // Only check transfer restrictions for non-mint operations (from != address(0))
        // Allow burns (to == address(0)) as they are part of withdrawal processing
        if (from != address(0) && to != address(0)) {
            PendingRequest storage request = pendingRequests[from];
            
            // Check if the sender has a pending withdrawal request
            if (request.user == from && !request.isDeposit && !request.processed) {
                uint256 currentBalance = balanceOf(from);
                uint256 lockedShares = request.shares;
                
                // Check if the transfer would leave insufficient shares for the pending withdrawal
                if (currentBalance < lockedShares + value) {
                    revert SharesLockedForWithdrawal(from, lockedShares, value);
                }
            }
        }
        
        super._update(from, to, value);
    }

    // ============ Manager Functions ============

    /**
     * @notice Approve funds usage to an external protocol
     * @param protocol Address of the target protocol (PredictionMarket)
     * @param newApprovalAmount Amount of assets to approve
     */
    function approveFundsUsage(
        address protocol,
        uint256 newApprovalAmount
    ) external onlyManager nonReentrant {
        if (protocol == address(0)) revert InvalidProtocol(protocol);
        if (newApprovalAmount == 0) revert InvalidAmount(newApprovalAmount);

        uint256 availableAssetsValue = _getAvailableAssets();
        if (newApprovalAmount > availableAssetsValue)
            revert InsufficientAvailableAssets(newApprovalAmount, availableAssetsValue);

        // Get deployed liquidity and total approvals in a single loop (excluding current protocol)
        (uint256 deployedLiquidity, uint256 totalCurrentApprovals) = _getDeploymentAndApprovalsWithCleanup(protocol);
        uint256 totalAssetsValue = availableAssetsValue + deployedLiquidity;

        // Add the new approval amount for this protocol
        uint256 utilizedPlusApprovals = deployedLiquidity + totalCurrentApprovals + newApprovalAmount;

        // Check utilization rate limits - calculate projected utilization from total approvals
        uint256 projectedUtilizationRate = totalAssetsValue > 0
            ? (utilizedPlusApprovals * WAD) / totalAssetsValue
            : 0;
        
        if (projectedUtilizationRate > maxUtilizationRate)
            revert ExceedsMaxUtilization(projectedUtilizationRate, maxUtilizationRate);

        // Update deployment info - use EnumerableSet for gas efficiency
        activeProtocols.add(protocol);

        _asset.forceApprove(protocol, newApprovalAmount);

        emit FundsApproved(msg.sender, newApprovalAmount, protocol);

        // Calculate current utilization for event
        uint256 currentUtilizationRate = totalAssetsValue > 0
            ? ((deployedLiquidity * WAD) / totalAssetsValue)
            : 0;
        emit ProjectedUtilizationRateUpdated(currentUtilizationRate, projectedUtilizationRate);
    }

    function cleanInactiveProtocols() external onlyManager {
        _getDeploymentAndApprovalsWithCleanup(address(0));
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
     * @notice Get available assets for withdrawals (excluding unconfirmed assets)
     * @return Available assets minus unconfirmed assets from pending deposits
     */
    function _getAvailableAssets() internal view returns (uint256) {
        uint256 balance = _asset.balanceOf(address(this));
        // Subtract unconfirmed assets (pending deposit requests)
        return balance > unconfirmedAssets ? balance - unconfirmedAssets : 0;
    }

    /**
     * @notice Get the number of shares locked for a pending withdrawal request
     * @param user Address of the user
     * @return Number of shares locked for withdrawal, 0 if no pending withdrawal
     */
    function getLockedShares(address user) external view returns (uint256) {
        PendingRequest storage request = pendingRequests[user];
        if (request.user == user && !request.isDeposit && !request.processed) {
            return request.shares;
        }
        return 0;
    }

    /**
     * @notice Get the number of shares available for transfer (total balance minus locked shares)
     * @param user Address of the user
     * @return Number of shares available for transfer
     */
    function getAvailableShares(address user) external view returns (uint256) {
        uint256 totalBalance = balanceOf(user);
        uint256 locked = 0;
        
        PendingRequest storage request = pendingRequests[user];
        if (request.user == user && !request.isDeposit && !request.processed) {
            locked = request.shares;
        }
        
        return totalBalance > locked ? totalBalance - locked : 0;
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
     * @param newMaxRate New maximum utilization rate (in WAD, e.g., 0.8e18 = 80%)
     */
    function setMaxUtilizationRate(uint256 newMaxRate) external onlyOwner {
        if (newMaxRate > WAD)
            revert InvalidRate(newMaxRate, WAD);
        uint256 oldRate = maxUtilizationRate;
        maxUtilizationRate = newMaxRate;

        // After a change in max utilization rate, reconcile approvals to keep utilization within bounds
        _reconcileApprovals();

        emit MaxUtilizationRateUpdated(oldRate, newMaxRate);
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
        emit EmergencyModeUpdated(emergencyMode);
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

    // ============ ERC-165 Interface Detection ============

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return 
            interfaceId == type(IPassiveLiquidityVault).interfaceId ||
            interfaceId == type(IERC1271).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ============ ERC721 Receiver ============

    /**
     * @notice Handle the receipt of an NFT
     * @dev This function is called when an ERC721 token is transferred to this contract via safeTransferFrom
     * @return bytes4 Returns `IERC721Receiver.onERC721Received.selector` to confirm the token transfer
     */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
