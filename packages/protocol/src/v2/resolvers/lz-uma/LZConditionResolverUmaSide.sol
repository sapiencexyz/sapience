// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    OApp,
    Origin,
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {
    OptionsBuilder
} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    OptimisticOracleV3Interface
} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import {
    OptimisticOracleV3CallbackRecipientInterface
} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";
import {
    ILZConditionResolverUmaSide
} from "./interfaces/ILZConditionResolverUmaSide.sol";
import { LZTypes } from "../shared/LZTypes.sol";
import { LZETHManagement } from "./LZETHManagement.sol";

/// @title LZConditionResolverUmaSide
/// @notice UMA-side LayerZero resolver for Prediction Market V2
/// @dev Handles UMA interactions and sends results to prediction market side
contract LZConditionResolverUmaSide is
    OApp,
    ILZConditionResolverUmaSide,
    OptimisticOracleV3CallbackRecipientInterface,
    ReentrancyGuard,
    LZETHManagement
{
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ============ Constants ============
    uint16 private constant CMD_CONDITION_RESOLVED = 8;

    // ============ Storage ============
    Settings public config;
    LZTypes.BridgeConfig private _bridgeConfig;
    address private _optimisticOracleV3;

    // Approved asserters
    mapping(address => bool) private _approvedAsserters;

    // Assertion tracking
    mapping(bytes32 => bytes32) private _conditionToAssertion; // conditionId => assertionId
    mapping(bytes32 => bytes32) private _assertionToCondition; // assertionId => conditionId
    mapping(bytes32 => bool) private _conditionResolvedToYes; // conditionId => resolvedToYes

    // ============ Constructor ============
    constructor(
        address endpoint_,
        address owner_,
        address optimisticOracleV3_,
        Settings memory config_
    ) OApp(endpoint_, owner_) LZETHManagement(owner_) {
        _optimisticOracleV3 = optimisticOracleV3_;
        config = config_;
    }

    // ============ Configuration Functions ============

    /// @notice Set the bridge configuration
    function setBridgeConfig(LZTypes.BridgeConfig calldata bridgeConfig_)
        external
        onlyOwner
    {
        _bridgeConfig = bridgeConfig_;
        emit BridgeConfigUpdated(bridgeConfig_);
    }

    /// @notice Get the bridge configuration
    function getBridgeConfig()
        external
        view
        returns (LZTypes.BridgeConfig memory)
    {
        return _bridgeConfig;
    }

    /// @notice Set the UMA configuration
    function setConfig(Settings calldata config_) external onlyOwner {
        config = config_;
        emit ConfigUpdated(
            config_.bondCurrency, config_.bondAmount, config_.assertionLiveness
        );
    }

    /// @notice Get the UMA configuration
    function getConfig() external view returns (Settings memory) {
        return config;
    }

    /// @notice Set the Optimistic Oracle V3 address
    function setOptimisticOracleV3(address optimisticOracleV3_)
        external
        onlyOwner
    {
        _optimisticOracleV3 = optimisticOracleV3_;
        emit OptimisticOracleV3Updated(optimisticOracleV3_);
    }

    /// @notice Get the Optimistic Oracle V3 address
    function getOptimisticOracleV3() external view returns (address) {
        return _optimisticOracleV3;
    }

    // ============ Asserter Management ============

    /// @notice Approve an asserter
    function approveAsserter(address asserter) external onlyOwner {
        _approvedAsserters[asserter] = true;
        emit AsserterApproved(asserter);
    }

    /// @notice Revoke an asserter
    function revokeAsserter(address asserter) external onlyOwner {
        _approvedAsserters[asserter] = false;
        emit AsserterRevoked(asserter);
    }

    /// @notice Check if an asserter is approved
    function isAsserterApproved(address asserter) external view returns (bool) {
        return _approvedAsserters[asserter];
    }

    // ============ Bond Management ============

    /// @notice Withdraw bond tokens (for stuck tokens)
    function withdrawBond(address token, uint256 amount, address to)
        external
        onlyOwner
    {
        IERC20(token).safeTransfer(to, amount);
        emit BondWithdrawn(token, amount, to);
    }

    // ============ Assertion Functions ============

    /// @notice Submit an assertion to UMA
    /// @param claim The claim bytes
    /// @param endTime The condition end time
    /// @param resolvedToYes Whether the condition resolved to YES
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external nonReentrant {
        if (!_approvedAsserters[msg.sender]) {
            revert OnlyApprovedAssertersCanCall();
        }
        if (block.timestamp < endTime) {
            revert ConditionNotEnded();
        }

        bytes32 conditionId = keccak256(abi.encodePacked(claim, ":", endTime));

        if (_conditionToAssertion[conditionId] != bytes32(0)) {
            revert AssertionAlreadySubmitted();
        }

        OptimisticOracleV3Interface oracle =
            OptimisticOracleV3Interface(_optimisticOracleV3);
        IERC20 bondCurrency = IERC20(config.bondCurrency);

        // Check bond balance
        uint256 balance = bondCurrency.balanceOf(address(this));
        if (balance < config.bondAmount) {
            revert NotEnoughBondAmount(
                msg.sender, config.bondCurrency, config.bondAmount, balance
            );
        }

        // Approve bond to oracle
        bondCurrency.forceApprove(address(oracle), config.bondAmount);

        // Build claim (negate if NO)
        bytes memory finalClaim =
            resolvedToYes ? claim : abi.encodePacked("False: ", claim);

        // Submit assertion
        bytes32 assertionId = oracle.assertTruth(
            finalClaim,
            address(this), // bond recipient
            address(this), // callback recipient
            address(0), // escalation manager
            config.assertionLiveness,
            bondCurrency,
            config.bondAmount,
            bytes32("ASSERT_TRUTH2"),
            bytes32(0)
        );

        // Store mappings
        _conditionToAssertion[conditionId] = assertionId;
        _assertionToCondition[assertionId] = conditionId;
        _conditionResolvedToYes[conditionId] = resolvedToYes;

        emit ConditionSubmittedToUMA(
            conditionId, assertionId, msg.sender, claim, resolvedToYes
        );
    }

    // ============ UMA Callbacks ============

    /// @notice Callback when assertion is resolved
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external override nonReentrant {
        if (msg.sender != _optimisticOracleV3) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 conditionId = _assertionToCondition[assertionId];
        if (conditionId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        bool resolvedToYes = _conditionResolvedToYes[conditionId];

        // Only forward resolution via LayerZero if UMA confirmed truthfully
        if (assertedTruthfully) {
            _sendConditionResolved(
                conditionId, resolvedToYes, assertedTruthfully
            );
        }

        emit ConditionResolvedFromUMA(
            conditionId, assertionId, resolvedToYes, assertedTruthfully
        );

        // Clean up (allows re-submission if assertion was disputed/rejected)
        delete _conditionToAssertion[conditionId];
        delete _assertionToCondition[assertionId];
        delete _conditionResolvedToYes[conditionId];
    }

    /// @notice Callback when assertion is disputed
    function assertionDisputedCallback(bytes32 assertionId) external override {
        if (msg.sender != _optimisticOracleV3) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 conditionId = _assertionToCondition[assertionId];
        if (conditionId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        emit ConditionDisputedFromUMA(conditionId, assertionId);
    }

    // ============ View Functions ============

    /// @notice Get assertion ID for a condition
    function getConditionAssertionId(bytes32 conditionId)
        external
        view
        returns (bytes32)
    {
        return _conditionToAssertion[conditionId];
    }

    /// @notice Get condition ID for an assertion
    function getAssertionConditionId(bytes32 assertionId)
        external
        view
        returns (bytes32)
    {
        return _assertionToCondition[assertionId];
    }

    // ============ LayerZero Functions ============

    /// @notice LayerZero receive (not used on UMA side)
    function _lzReceive(
        Origin calldata,
        bytes32,
        bytes calldata,
        address,
        bytes calldata
    ) internal override {
        // UMA side doesn't receive messages
    }

    /// @notice Send condition resolved message to PM side
    function _sendConditionResolved(
        bytes32 conditionId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) internal {
        bytes memory payload = abi.encode(
            conditionId, resolvedToYes, assertedTruthfully
        );
        bytes memory message = abi.encode(CMD_CONDITION_RESOLVED, payload);

        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(_getLzReceiveCost(), 0);

        // Get quote
        MessagingFee memory fee =
            _quote(_bridgeConfig.remoteEid, message, options, false);

        // Check ETH balance
        _requireSufficientETH(fee.nativeFee);

        // Send via self-call to use contract's ETH
        this._sendMessageWithETH{ value: fee.nativeFee }(
            _bridgeConfig.remoteEid, message, options, fee
        );
    }

    /// @notice External function to send LayerZero messages with ETH from contract balance
    /// @dev Only callable by this contract
    function _sendMessageWithETH(
        uint32 dstEid,
        bytes memory message,
        bytes memory options,
        MessagingFee memory fee
    ) external payable returns (MessagingReceipt memory) {
        if (msg.sender != address(this)) {
            revert OnlySelfCallAllowed(msg.sender);
        }
        return _lzSend(dstEid, message, options, fee, payable(address(this)));
    }
}
