// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../interfaces/IV2Types.sol";

/**
 * @title IPredictionMarketVault
 * @notice Interface for the PredictionMarketVault contract with request-based deposits and withdrawals
 * @dev Simplified from V1 - removes utilization tracking since PredictionMarketEscrow uses ERC20 position tokens
 */
interface IPredictionMarketVault is IERC1271, IERC165 {
    // ============ Structs ============
    struct PendingRequest {
        uint256 shares;
        uint256 assets;
        uint64 timestamp;
        address user;
        bool isDeposit;
        bool processed;
    }

    // ============ Events ============

    event PendingRequestCreated(
        address indexed user, bool direction, uint256 shares, uint256 assets
    );
    event PendingRequestProcessed(
        address indexed user, bool direction, uint256 shares, uint256 assets
    );
    event PendingRequestCancelled(
        address indexed user, bool direction, uint256 shares, uint256 assets
    );

    event FundsApproved(
        address indexed manager, uint256 assets, address targetProtocol
    );
    event EmergencyWithdrawal(
        address indexed user, uint256 shares, uint256 assets
    );
    event ManagerUpdated(
        address indexed oldManager, address indexed newManager
    );
    event ExpirationTimeUpdated(
        uint256 oldExpirationTime, uint256 newExpirationTime
    );
    event DepositInteractionDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event WithdrawalInteractionDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event EmergencyModeUpdated(bool emergencyMode);

    // ============ State Variables ============

    function manager() external view returns (address);
    function expirationTime() external view returns (uint256);
    function depositInteractionDelay() external view returns (uint256);
    function withdrawalInteractionDelay() external view returns (uint256);
    function availableAssets() external view returns (uint256);
    function emergencyMode() external view returns (bool);

    // ============ Request-based Deposit/Withdrawal Functions ============

    function requestDeposit(uint256 assets, uint256 expectedShares) external;
    function requestWithdrawal(uint256 shares, uint256 expectedAssets) external;

    function cancelWithdrawal() external;
    function cancelDeposit() external;

    function emergencyWithdraw(uint256 shares) external;

    // ============ Manager Functions ============

    function processDeposit(address requestedBy) external;
    function processWithdrawal(address requestedBy) external;

    function batchProcessDeposit(address[] calldata requesters) external;
    function batchProcessWithdrawal(address[] calldata requesters) external;

    /**
     * @notice Approve funds usage to an external protocol
     * @param protocol Address of the target protocol (PredictionMarketEscrow)
     * @param amount Amount of assets to approve
     */
    function approveFundsUsage(address protocol, uint256 amount) external;

    /**
     * @notice Redeem winning position tokens from PredictionMarketEscrow
     * @param escrow Address of the PredictionMarketEscrow contract
     * @param positionToken Address of the position token to redeem
     * @param amount Amount of position tokens to redeem
     * @param refCode Referral code
     * @return payout Amount of collateral received
     */
    function redeemFromEscrow(
        address escrow,
        address positionToken,
        uint256 amount,
        bytes32 refCode
    ) external returns (uint256 payout);

    /**
     * @notice Participate in a burn (mutual cancel) on PredictionMarketEscrow
     * @param escrow Address of the PredictionMarketEscrow contract
     * @param request The burn request struct (both parties must have signed)
     */
    function burnFromEscrow(
        address escrow,
        IV2Types.BurnRequest calldata request
    ) external;

    // ============ View Functions ============

    function getLockedShares(address user) external view returns (uint256);
    function getAvailableShares(address user) external view returns (uint256);
    function getPendingWithdrawals() external view returns (uint256 shares);

    // ============ Admin Functions ============

    function setManager(address newManager) external;
    function setExpirationTime(uint256 newExpirationTime) external;
    function setDepositInteractionDelay(uint256 newDelay) external;
    function setWithdrawalInteractionDelay(uint256 newDelay) external;
    function toggleEmergencyMode() external;
    function pause() external;
    function unpause() external;
}
