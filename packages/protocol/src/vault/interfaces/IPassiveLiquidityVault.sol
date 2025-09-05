// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title IPassiveLiquidityVault
 * @notice Interface for the ERC-4626 compliant PassiveLiquidityVault contract
 */
interface IPassiveLiquidityVault is IERC4626 {
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

    // ============ State Variables ============
    
    function manager() external view returns (address);
    function maxUtilizationRate() external view returns (uint256);
    function utilizationRate() external view returns (uint256);
    function withdrawalDelay() external view returns (uint256);
    function totalDeployed() external view returns (uint256);
    function emergencyMode() external view returns (bool);

    // ============ Custom Withdrawal Functions ============
    
    function requestWithdrawal(uint256 shares) external returns (uint256 queuePosition);
    function processWithdrawals(uint256 maxRequests) external;
    function emergencyWithdraw(uint256 shares) external;

    // ============ Manager Functions ============
    
    function deployFunds(address protocol, uint256 amount, bytes calldata data) external;
    function recallFunds(address protocol, uint256 amount, bytes calldata data) external;

    // ============ View Functions ============
    
    function getPendingWithdrawal(address user) external view returns (uint256 amount);
    function getWithdrawalQueueLength() external view returns (uint256);
    function getWithdrawalRequest(uint256 index) external view returns (WithdrawalRequest memory);
    function getActiveProtocolsCount() external view returns (uint256);
    function getActiveProtocol(uint256 index) external view returns (address);

    // ============ Admin Functions ============
    
    function setManager(address newManager) external;
    function setMaxUtilizationRate(uint256 newMaxRate) external;
    function setWithdrawalDelay(uint256 newDelay) external;
    function toggleEmergencyMode() external;
    function pause() external;
    function unpause() external;
}