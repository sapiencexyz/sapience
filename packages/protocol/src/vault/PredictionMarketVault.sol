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
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../utils/SignatureProcessor.sol";
import "./interfaces/IPredictionMarketVault.sol";
import "../interfaces/IPredictionMarketEscrow.sol";

/// @dev Minimal interface for querying prediction market token info
interface IPredictionMarketTokenInfo {
    function pickConfigId() external view returns (bytes32);
}

/// @dev Minimal interface for querying prediction market info
interface IPredictionMarketInfo {
    function getClaimableAmount(
        bytes32 pickConfigId,
        address positionToken,
        uint256 tokenAmount
    ) external view returns (uint256);
}

/**
 * @title PredictionMarketVault
 * @notice A passive liquidity vault that allows users to deposit assets and earn yield through EOA-managed protocol interactions
 *
 * HOW IT WORKS:
 * 1. Users request deposits by specifying assets and expected shares, with assets transferred immediately to the vault
 * 2. Users request withdrawals by specifying shares and expected assets, with no immediate transfer
 * 3. A designated EOA manager processes requests when market conditions are favorable (fair pricing)
 * 4. If requests expire (default 10 minutes) or conditions aren't favorable, users can cancel their requests
 * 5. Users must wait between requests (default 1 day) to prevent rapid-fire interactions
 * 6. The manager can approve vault funds for use by external protocols (e.g., PredictionMarketEscrow)
 * 7. Emergency mode allows immediate proportional withdrawals using only vault balance
 *
 * KEY FEATURES:
 * - Request-based deposit and withdrawal system with manager-controlled processing
 * - Interaction delay (default 1 day) between user requests to prevent abuse
 * - Request expiration (default 10 minutes) with user cancellation capability
 * - Emergency mode for immediate proportional withdrawals during crises
 * - EOA manager can approve funds for use by any protocol
 * - Comprehensive access controls and safety mechanisms
 * - Custom errors for gas-efficient error handling
 *
 * DIFFERENCES FROM V1:
 * - No utilization rate tracking (PredictionMarketEscrow uses ERC20 position tokens, not NFTs)
 * - No ERC721 receiver (V2 doesn't use NFTs for positions)
 * - Simplified approveFundsUsage without utilization checks
 *
 * @dev Implements request-based deposit/withdrawal system and EOA-controlled fund approval
 */
contract PredictionMarketVault is
    ERC20,
    IPredictionMarketVault,
    Ownable2Step,
    ReentrancyGuard,
    Pausable,
    SignatureProcessor,
    ERC165
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ============ Vault ============
    IERC20 private immutable _asset;
    uint8 private immutable _underlyingDecimals;

    // ============ Default Values ============

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

    // State errors
    error EmergencyModeActive();
    error InsufficientBalance(
        address user, uint256 requested, uint256 available
    );
    error InsufficientAvailableAssets(uint256 requested, uint256 available);

    // Queue errors
    error NoPendingRequests(address user);
    error NoPendingWithdrawal(address user);
    error NoPendingDeposit(address user);
    error PendingRequestNotProcessed(address user);
    error TransferFailed(
        uint256 balanceBefore, uint256 amount, uint256 balanceAfter
    );
    error RequestNotExpired();
    error InteractionDelayNotExpired();

    // Emergency errors
    error EmergencyModeNotActive();

    // Additional errors
    error RequestExpired();
    error SharesLockedForWithdrawal(
        address user, uint256 lockedShares, uint256 attemptedTransfer
    );

    // ============ Events ============
    // Events are defined in the IPredictionMarketVault interface

    // ============ State Variables ============

    /// @notice The EOA manager who can approve funds for use by protocols
    address public manager;

    /// @notice Interaction delay in seconds between deposit requests (default: 1 day)
    uint256 public depositInteractionDelay = DEFAULT_INTERACTION_DELAY;

    /// @notice Interaction delay in seconds between withdrawal requests (default: 1 day)
    uint256 public withdrawalInteractionDelay = DEFAULT_INTERACTION_DELAY;

    /// @notice Expiration time in seconds for user requests before they can be cancelled (default: 10 minutes)
    uint256 public expirationTime = DEFAULT_EXPIRATION_TIME; // 10 minutes

    /// @notice Mapping of user to their last interaction timestamp (used to enforce interaction delay)
    mapping(address => uint256) public lastUserInteractionTimestamp;

    /// @notice Emergency mode flag
    bool public emergencyMode = false;

    /// @notice Total assets reserved for pending deposit requests
    uint256 private unconfirmedAssets = 0;

    /// @notice Total shares pending withdrawal
    uint256 private pendingWithdrawalShares = 0;

    /// @notice Total assets pending withdrawal
    // C-3: pendingWithdrawalAssets removed — was unused bookkeeping vulnerable
    // to griefing via unconstrained expectedAssets overflow

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
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        if (asset_ == address(0)) {
            revert InvalidAsset(asset_);
        }
        if (_manager == address(0)) revert InvalidManager(_manager);

        _asset = IERC20(asset_);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(_asset);
        _underlyingDecimals = success ? assetDecimals : 18;

        manager = _manager;
    }

    /**
     * @dev Attempts to fetch the asset decimals. A return value of false indicates that the attempt failed in some way.
     */
    function _tryGetAssetDecimals(IERC20 asset_)
        private
        view
        returns (bool, uint8)
    {
        (bool success, bytes memory encodedDecimals) = address(asset_)
            .staticcall(abi.encodeCall(IERC20Metadata.decimals, ()));
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

    /**
     * @dev See {IERC20-asset}.
     */
    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    function availableAssets() public view returns (uint256) {
        uint256 balance = _asset.balanceOf(address(this));
        // Subtract unconfirmed assets (pending deposit requests)
        return balance > unconfirmedAssets ? balance - unconfirmedAssets : 0;
    }

    /**
     * @notice Request withdrawal of shares - creates a pending request that the manager can process
     * @param shares Number of shares to withdraw
     * @param expectedAssets Expected assets to receive (used for validation by manager)
     * @dev The request will expire after expirationTime and can be cancelled by the user
     */
    function requestWithdrawal(uint256 shares, uint256 expectedAssets)
        external
        nonReentrant
        whenNotPaused
        notEmergency
    {
        if (shares == 0) revert InvalidShares(shares);
        if (expectedAssets == 0) revert InvalidAmount(expectedAssets);

        uint256 balance = balanceOf(msg.sender);
        if (balance < shares) {
            revert InsufficientBalance(msg.sender, shares, balance);
        }
        if (
            lastUserInteractionTimestamp[msg.sender] > 0
                && lastUserInteractionTimestamp[msg.sender]
                        + withdrawalInteractionDelay > block.timestamp
        ) revert InteractionDelayNotExpired();

        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == msg.sender && !request.processed) {
            revert PendingRequestNotProcessed(msg.sender);
        }

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        pendingRequests[msg.sender] = IPredictionMarketVault.PendingRequest({
            shares: shares,
            assets: expectedAssets,
            timestamp: uint64(block.timestamp),
            user: msg.sender,
            isDeposit: false,
            processed: false
        });

        pendingWithdrawalShares += shares;

        emit PendingRequestCreated(msg.sender, false, shares, expectedAssets);
    }

    /**
     * @notice Request deposit of assets - creates a pending request that the manager can process
     * @param assets Number of assets to deposit (transferred immediately to vault)
     * @param expectedShares Expected shares to receive (used for validation by manager)
     * @dev The request will expire after expirationTime and can be cancelled by the user
     */
    function requestDeposit(uint256 assets, uint256 expectedShares)
        external
        nonReentrant
        whenNotPaused
        notEmergency
    {
        if (assets == 0) revert InvalidAmount(assets);
        if (expectedShares == 0) revert InvalidShares(expectedShares);
        if (
            lastUserInteractionTimestamp[msg.sender] > 0
                && lastUserInteractionTimestamp[msg.sender]
                        + depositInteractionDelay > block.timestamp
        ) revert InteractionDelayNotExpired();
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == msg.sender && !request.processed) {
            revert PendingRequestNotProcessed(msg.sender);
        }

        lastUserInteractionTimestamp[msg.sender] = block.timestamp;

        // Transfer assets from user to vault
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore + assets != balanceAfter) {
            revert TransferFailed(balanceBefore, assets, balanceAfter);
        }

        pendingRequests[msg.sender] = IPredictionMarketVault.PendingRequest({
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
        if (request.user == address(0) || request.processed) {
            revert NoPendingRequests(msg.sender);
        }
        if (request.isDeposit) revert NoPendingWithdrawal(msg.sender);
        if (request.timestamp + expirationTime > block.timestamp) {
            revert RequestNotExpired();
        }

        pendingWithdrawalShares -= request.shares;

        request.user = address(0);

        // Reset the interaction timestamp to allow user to post a new request after a request has expired (most likely due to volatility)
        lastUserInteractionTimestamp[msg.sender] = 0;

        emit PendingRequestCancelled(
            msg.sender, false, request.shares, request.assets
        );
    }

    /**
     * @notice Cancel a pending deposit request after expiration time
     * @dev Can only be called after the request has expired, returns assets to user
     */
    function cancelDeposit() external nonReentrant whenNotPaused {
        PendingRequest storage request = pendingRequests[msg.sender];
        if (request.user == address(0) || request.processed) {
            revert NoPendingRequests(msg.sender);
        }
        if (!request.isDeposit) revert NoPendingDeposit(msg.sender);
        if (request.timestamp + expirationTime > block.timestamp) {
            revert RequestNotExpired();
        }

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
        if (balanceBefore != assetsToReturn + balanceAfter) {
            revert TransferFailed(balanceBefore, assetsToReturn, balanceAfter);
        }

        // Reset the interaction timestamp to allow user to post a new request after a request has expired (most likely due to volatility)
        lastUserInteractionTimestamp[msg.sender] = 0;

        emit PendingRequestCancelled(
            msg.sender, true, request.shares, assetsToReturn
        );
    }

    /**
     * @notice Process a pending deposit request (manager only)
     * @param requestedBy Address of the user who made the deposit request
     * @dev Mints shares to the user and marks the request as processed
     */
    function processDeposit(address requestedBy)
        external
        nonReentrant
        onlyManager
    {
        _processDeposit(requestedBy);
    }

    /**
     * @notice Batch process multiple pending deposit requests (manager only)
     * @param requesters Array of addresses who made deposit requests
     * @dev Processes each deposit request, reverts if any request fails
     */
    function batchProcessDeposit(address[] calldata requesters)
        external
        nonReentrant
        onlyManager
    {
        for (uint256 i = 0; i < requesters.length; i++) {
            _processDeposit(requesters[i]);
        }
    }

    function _processDeposit(address requestedBy) internal {
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
            requestedBy, true, request.shares, request.assets
        );
    }

    /**
     * @notice Process a pending withdrawal request (manager only)
     * @param requestedBy Address of the user who made the withdrawal request
     * @dev Burns shares and transfers assets to the user, marks request as processed
     */
    function processWithdrawal(address requestedBy)
        external
        nonReentrant
        onlyManager
    {
        _processWithdrawal(requestedBy);
    }

    /**
     * @notice Batch process multiple pending withdrawal requests (manager only)
     * @param requesters Array of addresses who made withdrawal requests
     * @dev Processes each withdrawal request, reverts if any request fails
     */
    function batchProcessWithdrawal(address[] calldata requesters)
        external
        nonReentrant
        onlyManager
    {
        for (uint256 i = 0; i < requesters.length; i++) {
            _processWithdrawal(requesters[i]);
        }
    }

    function _processWithdrawal(address requestedBy) internal {
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

        pendingWithdrawalShares -= request.shares;

        _burn(requestedBy, request.shares);

        // Transfer assets from vault to user
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransfer(request.user, request.assets);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore != request.assets + balanceAfter) {
            revert TransferFailed(balanceBefore, request.assets, balanceAfter);
        }

        emit PendingRequestProcessed(
            requestedBy, false, request.shares, request.assets
        );
    }

    /**
     * @notice Emergency withdrawal (bypasses delay and uses proportional vault balance)
     * @param shares Number of shares to withdraw
     * @dev Only available in emergency mode, uses vault balance only (not deployed funds)
     *      IMPORTANT: This only withdraws liquid assets. If the vault holds position tokens
     *      from unsettled predictions, those are NOT included in the emergency withdrawal.
     *      Users may need to wait for predictions to settle to recover full value.
     *      Use getPredictionMarketTokenValue() to check for unredeemed position tokens.
     */
    function emergencyWithdraw(uint256 shares) external nonReentrant {
        if (!emergencyMode) revert EmergencyModeNotActive();
        if (shares == 0) revert InvalidShares(shares);
        if (balanceOf(msg.sender) < shares) {
            revert InsufficientBalance(
                msg.sender, shares, balanceOf(msg.sender)
            );
        }

        uint256 totalShares = totalSupply();
        if (totalShares == 0) revert InvalidShares(totalShares); // No shares issued yet

        // Convert shares to assets using just the vault's balance and not the total assets
        uint256 vaultBalance = _getAvailableAssets();
        if (vaultBalance == 0) revert InsufficientAvailableAssets(shares, 0);

        uint256 withdrawAmount =
            Math.mulDiv(shares, vaultBalance, totalShares, Math.Rounding.Floor);

        // Ensure we don't withdraw more than available
        if (withdrawAmount > vaultBalance) {
            revert InsufficientAvailableAssets(withdrawAmount, vaultBalance);
        }
        if (withdrawAmount == 0) revert InvalidAmount(withdrawAmount); // Prevent zero withdrawals

        _burn(msg.sender, shares);
        uint256 balanceBefore = _asset.balanceOf(address(this));
        _asset.safeTransfer(msg.sender, withdrawAmount);
        uint256 balanceAfter = _asset.balanceOf(address(this));
        if (balanceBefore != withdrawAmount + balanceAfter) {
            revert TransferFailed(balanceBefore, withdrawAmount, balanceAfter);
        }

        emit EmergencyWithdrawal(msg.sender, shares, withdrawAmount);
    }

    /**
     * @notice Override ERC20 _update to prevent transfers of shares locked for withdrawal
     * @param from Address sending tokens (address(0) for minting)
     * @param to Address receiving tokens (address(0) for burning)
     * @param value Amount of tokens being transferred
     * @dev Prevents users from transferring shares that are locked in pending withdrawal requests
     */
    function _update(address from, address to, uint256 value)
        internal
        virtual
        override
    {
        // Only check transfer restrictions for non-mint operations (from != address(0))
        // Allow burns (to == address(0)) as they are part of withdrawal processing
        if (from != address(0) && to != address(0)) {
            PendingRequest storage request = pendingRequests[from];

            // Check if the sender has a pending withdrawal request
            if (
                request.user == from && !request.isDeposit && !request.processed
            ) {
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
     * @param protocol Address of the target protocol (e.g., PredictionMarketEscrow)
     * @param amount Amount of assets to approve
     * @dev Simplified from V1 - no utilization tracking, just approve if available
     */
    function approveFundsUsage(address protocol, uint256 amount)
        external
        onlyManager
        nonReentrant
    {
        if (protocol == address(0)) revert InvalidProtocol(protocol);
        if (amount == 0) revert InvalidAmount(amount);

        uint256 available = _getAvailableAssets();
        if (amount > available) {
            revert InsufficientAvailableAssets(amount, available);
        }

        _asset.forceApprove(protocol, amount);
        emit FundsApproved(msg.sender, amount, protocol);
    }

    // ============ Signature Functions ============

    function isValidSignature(bytes32 messageHash, bytes memory signature)
        external
        view
        returns (bytes4)
    {
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
     * @notice Get the total pending withdrawal volume
     * @return shares Total shares pending withdrawal
     */
    function getPendingWithdrawals() external view returns (uint256 shares) {
        shares = pendingWithdrawalShares;
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

    // ============ Position Token Value Functions ============

    /**
     * @notice Get the value of a position token held by this vault
     * @param positionToken The position token address
     * @param predictionMarket The PredictionMarketEscrow contract address
     * @return balance The amount of position tokens held
     * @return claimableValue The claimable value if resolved (0 if unresolved)
     * @dev Use this to check for unredeemed position tokens from predictions.
     *      IMPORTANT: Emergency withdrawals do NOT include position token value.
     *      Users should monitor this to understand full vault value.
     */
    function getPredictionMarketTokenValue(
        address positionToken,
        address predictionMarket
    ) external view returns (uint256 balance, uint256 claimableValue) {
        balance = IERC20(positionToken).balanceOf(address(this));
        if (balance == 0) {
            return (0, 0);
        }

        // Try to get the pickConfigId from the token
        // This is a best-effort check - may not work for all token types
        try IPredictionMarketTokenInfo(positionToken).pickConfigId() returns (
            bytes32 pickConfigId
        ) {
            // Try to get claimable amount from the market
            try IPredictionMarketInfo(predictionMarket)
                .getClaimableAmount(
                    pickConfigId, positionToken, balance
                ) returns (
                uint256 amount
            ) {
                claimableValue = amount;
            } catch {
                // Market call failed, claimable value unknown
                claimableValue = 0;
            }
        } catch {
            // Token doesn't support pickConfigId, can't determine value
            claimableValue = 0;
        }
    }

    /**
     * @notice Get the total value of the vault including liquid assets
     * @return liquidAssets The available liquid assets
     * @return unconfirmedDeposits Assets from pending deposits (not yet confirmed)
     * @dev Position token values must be queried separately using getPredictionMarketTokenValue()
     *      as the vault doesn't track which position tokens it holds.
     */
    function getTotalLiquidValue()
        external
        view
        returns (uint256 liquidAssets, uint256 unconfirmedDeposits)
    {
        liquidAssets = _getAvailableAssets();
        unconfirmedDeposits = unconfirmedAssets;
    }

    // ============ Escrow Redeem / Burn ============

    /// @notice Emitted when the vault redeems winning position tokens from escrow
    event EscrowRedeemed(
        address indexed escrow,
        address indexed positionToken,
        uint256 amount,
        uint256 payout,
        bytes32 refCode
    );

    /// @notice Emitted when the vault participates in a burn (mutual cancel) on escrow
    event EscrowBurned(address indexed escrow, bytes32 indexed pickConfigId);

    /**
     * @notice Redeem winning position tokens from PredictionMarketEscrow
     * @param escrow Address of the PredictionMarketEscrow contract
     * @param positionToken Address of the position token to redeem
     * @param amount Amount of position tokens to redeem
     * @param refCode Referral code
     * @return payout Amount of collateral received
     * @dev The vault holds position tokens as counterparty. After settlement,
     *      the manager calls this to convert winning tokens back to collateral.
     */
    function redeemFromEscrow(
        address escrow,
        address positionToken,
        uint256 amount,
        bytes32 refCode
    ) external onlyManager nonReentrant returns (uint256 payout) {
        if (escrow == address(0)) revert InvalidProtocol(escrow);
        if (amount == 0) revert InvalidAmount(amount);

        payout = IPredictionMarketEscrow(escrow)
            .redeem(positionToken, amount, refCode);

        emit EscrowRedeemed(escrow, positionToken, amount, payout, refCode);
    }

    /**
     * @notice Participate in a burn (mutual cancel) on PredictionMarketEscrow
     * @param escrow Address of the PredictionMarketEscrow contract
     * @param request The burn request struct (both parties must have signed)
     * @dev Used when both predictor and vault agree to cancel a prediction
     *      before settlement. The vault's position tokens are burned and
     *      collateral is returned according to the agreed split.
     */
    function burnFromEscrow(
        address escrow,
        IV2Types.BurnRequest calldata request
    ) external onlyManager nonReentrant {
        if (escrow == address(0)) revert InvalidProtocol(escrow);

        IPredictionMarketEscrow(escrow).burn(request);

        emit EscrowBurned(escrow, request.pickConfigId);
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
     * @notice Set interaction delay between deposit requests
     * @param newDelay New interaction delay in seconds
     */
    function setDepositInteractionDelay(uint256 newDelay) external onlyOwner {
        uint256 oldDelay = depositInteractionDelay;
        depositInteractionDelay = newDelay;
        emit DepositInteractionDelayUpdated(oldDelay, newDelay);
    }

    /**
     * @notice Set interaction delay between withdrawal requests
     * @param newDelay New interaction delay in seconds
     */
    function setWithdrawalInteractionDelay(uint256 newDelay)
        external
        onlyOwner
    {
        uint256 oldDelay = withdrawalInteractionDelay;
        withdrawalInteractionDelay = newDelay;
        emit WithdrawalInteractionDelayUpdated(oldDelay, newDelay);
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
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165, IERC165)
        returns (bool)
    {
        return interfaceId == type(IPredictionMarketVault).interfaceId
            || interfaceId == type(IERC1271).interfaceId
            || super.supportsInterface(interfaceId);
    }
}
