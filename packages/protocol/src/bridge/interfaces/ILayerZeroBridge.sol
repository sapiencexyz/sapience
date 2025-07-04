// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BridgeTypes } from "../BridgeTypes.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title ILayerZeroBridge
 * @notice Common interface for LayerZero bridge contracts
 */
interface ILayerZeroBridge {
    // Common functions
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _config) external;
    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory);
}


interface IETHManagement {
    // Events
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    // Functions
    function depositETH() external payable;
    function withdrawETH(uint256 amount) external;
    function getETHBalance() external view returns (uint256);
}

interface IFeeManagement {
    // Events
    event GasReserveLow(uint256 currentBalance);
    event GasReserveCritical(uint256 currentBalance);

    // Functions
    function setLzReceiveCost(uint128 _lzReceiveCost) external;
    function setGasThresholds(uint256 _warningGasThreshold, uint256 _criticalGasThreshold) external;
    function getLzReceiveCost() external view returns (uint128);
    function getGasThresholds() external view returns (uint256, uint256);
}

interface IBondManagement {
    // Events
    event BondDeposited(address indexed submitter, address indexed bondToken, uint256 amount);
    event BondWithdrawalIntentCreated(address indexed submitter, address indexed bondToken, uint256 amount, uint256 timestamp);
    event WithdrawalExecuted(address indexed submitter, address indexed bondToken, uint256 amount);

    // Functions
    function depositBond(address bondToken, uint256 amount) external returns (MessagingReceipt memory);
    function intentToWithdrawBond(address bondToken, uint256 amount) external returns (MessagingReceipt memory);
    function executeWithdrawal(address bondToken) external returns (MessagingReceipt memory);
    function getBondBalance(address submitter, address bondToken) external view returns (uint256);
    function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256);
}

/**
 * @title IUMALayerZeroBridge
 * @notice Interface for UMA-side LayerZero bridge
 */
interface IUMALayerZeroBridge is ILayerZeroBridge, IBondManagement {
    // Events
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig config);

    // UMA-side specific functions
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external returns (MessagingReceipt memory);
    function assertionDisputedCallback(bytes32 assertionId) external returns (MessagingReceipt memory);

    // Optimistic Oracle V3
    function setOptimisticOracleV3(address _optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);
}

/**
 * @title IMarketLayerZeroBridge
 * @notice Interface for Market-side LayerZero bridge
 */
interface IMarketLayerZeroBridge is ILayerZeroBridge {
    // Events
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig config);
    event BondDeposited(address indexed submitter, address indexed bondToken, uint256 amount);
    event BondWithdrawn(address indexed submitter, address indexed bondToken, uint256 amount);
    event AssertionSubmitted(address indexed marketGroup, uint256 indexed marketId, uint256 assertionId);

    // Market-side specific functions
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter,
        uint64 liveness,
        address currency,
        uint256 bond
    ) external returns (bytes32);

    // MarketGroup Management
    function enableMarketGroup(address marketGroup) external;
    function disableMarketGroup(address marketGroup) external;
    function isMarketGroupEnabled(address marketGroup) external view returns (bool);
} 