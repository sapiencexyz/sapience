// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import {OptimisticOracleV3CallbackRecipientInterface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";
import {IPredictionMarketLZResolverUmaSide} from "./interfaces/IPredictionMarketLZResolverUmaSide.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "../../bridge/abstract/ETHManagement.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title PredictionMarketLZResolverUmaSide
 * @notice Simplified UMA-side LayerZero resolver contract for Prediction Market system
 * @dev This contract handles UMA interactions and sends results to prediction market side
 */
contract PredictionMarketLZResolverUmaSide is
    OApp,
    IPredictionMarketLZResolverUmaSide,
    OptimisticOracleV3CallbackRecipientInterface,
    ReentrancyGuard,
    ETHManagement
{
    using SafeERC20 for IERC20;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // ============ Settings ============
    struct Settings {
        address bondCurrency;
        uint256 bondAmount;
        uint64 assertionLiveness;
    }

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;
    address private optimisticOracleV3Address;

    // Asserters allowlist
    mapping(address => bool) private approvedAsserters;

    // Mapping to track assertions from prediction markets
    mapping(bytes32 => bytes32) private marketIdToAssertionId; // marketId => UMA assertionId
    mapping(bytes32 => bytes32) private assertionIdToMarketId; // UMA assertionId => marketId
    mapping(bytes32 => bool) private marketResolvedToYes; // marketId => resolvedToYes

    // No internal bond accounting; this contract expects bond tokens to be pre-funded via ERC20 transfers

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        address _optimisticOracleV3,
        Settings memory _config
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {
        optimisticOracleV3Address = _optimisticOracleV3;
        config = _config;
    }

    // ============ Configuration Functions ============
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
        emit BridgeConfigUpdated(_bridgeConfig);
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
        emit ConfigUpdated(_config.bondCurrency, _config.bondAmount, _config.assertionLiveness, msg.sender);
    }

    function setOptimisticOracleV3(address _optimisticOracleV3) external onlyOwner {
        optimisticOracleV3Address = _optimisticOracleV3;
        emit OptimisticOracleV3Updated(_optimisticOracleV3);
    }

    function getOptimisticOracleV3() external view returns (address) {
        return optimisticOracleV3Address;
    }

    // ============ Asserter Management ============
    function approveAsserter(address asserter) external onlyOwner {
        approvedAsserters[asserter] = true;
        emit AsserterApproved(asserter);
    }

    function revokeAsserter(address asserter) external onlyOwner {
        approvedAsserters[asserter] = false;
        emit AsserterRevoked(asserter);
    }

    function isAsserterApproved(address asserter) external view returns (bool) {
        return approvedAsserters[asserter];
    }

    // ============ Owner Bond Withdrawal ============
    function withdrawBond(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit OwnerWithdrewBond(token, amount, to);
    }

    // ============ Funding Note ============
    // Bond tokens should be transferred to this contract directly via ERC20 transfers.

    // ============ UMA Market Validation Functions ============
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external nonReentrant {
        if (!approvedAsserters[msg.sender]) {
            revert OnlyApprovedAssertersCanCall();
        }
        if (block.timestamp < endTime) {
            revert MarketNotEnded();
        }

        bytes32 marketId = keccak256(abi.encodePacked(claim, ":", endTime));

        if (marketIdToAssertionId[marketId] != bytes32(0)) {
            revert AssertionAlreadySubmitted();
        }

        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(optimisticOracleV3Address);
        IERC20 bondCurrency = IERC20(config.bondCurrency);

        // Check if the contract holds enough bond tokens
        if (bondCurrency.balanceOf(address(this)) < config.bondAmount) {
            revert NotEnoughBondAmount(
                msg.sender,
                config.bondCurrency,
                config.bondAmount,
                bondCurrency.balanceOf(address(this)),
                bondCurrency.balanceOf(address(this))
            );
        }

        // Approve the bond currency to the Optimistic Oracle V3
        bondCurrency.forceApprove(address(optimisticOracleV3), config.bondAmount);

        // Get the "false" claim if needed
        bytes memory finalClaim = resolvedToYes ? claim : abi.encodePacked("False: ", claim);

        // Submit the assertion to UMA
        bytes32 umaAssertionId = optimisticOracleV3.assertTruth(
            finalClaim,
            address(this), // bond recipient
            address(this), // callback recipient
            address(0), // escalation manager
            config.assertionLiveness,
            bondCurrency,
            config.bondAmount,
            bytes32('ASSERT_TRUTH2'),
            bytes32(0)
        );

        // Store the mapping between market and assertion
        marketIdToAssertionId[marketId] = umaAssertionId;
        assertionIdToMarketId[umaAssertionId] = marketId;
        marketResolvedToYes[marketId] = resolvedToYes;

        emit MarketSubmittedToUMA(
            marketId,
            umaAssertionId,
            msg.sender,
            claim,
            resolvedToYes
        );
    }

    // ============ UMA Callback Functions ============
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external nonReentrant override {
        if (msg.sender != optimisticOracleV3Address) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 marketId = assertionIdToMarketId[assertionId];
        if (marketId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        bool resolvedToYes = marketResolvedToYes[marketId];

        // Only forward resolution via LayerZero if UMA confirmed the assertion as truthful
        if (assertedTruthfully) {
            bytes memory commandPayload = Encoder.encodeFromUMAMarketResolved(
                marketId,
                resolvedToYes,
                assertedTruthfully
            );
            _sendLayerZeroMessageWithQuote(Encoder.CMD_FROM_UMA_MARKET_RESOLVED, commandPayload, false);
        }

        emit MarketResolvedFromUMA(
            marketId,
            assertionId,
            resolvedToYes,
            assertedTruthfully
        );

        // Clean up mappings (if asserted truthfully is false, it will allow for new assertions to be submitted)
        delete marketIdToAssertionId[marketId];
        delete assertionIdToMarketId[assertionId];
        delete marketResolvedToYes[marketId];
    }

    function assertionDisputedCallback(bytes32 assertionId) external override {
        if (msg.sender != optimisticOracleV3Address) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 marketId = assertionIdToMarketId[assertionId];
        if (marketId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        emit MarketDisputedFromUMA(marketId, assertionId);
    }

    // ============ Helper Functions ============
    function _sendLayerZeroMessageWithQuote(uint16 commandCode, bytes memory commandPayload, bool onlyQuote)
        internal
        returns (MessagingReceipt memory receipt, MessagingFee memory fee)
    {
        bytes memory message = abi.encode(commandCode, commandPayload);

        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(_getLzReceiveCost(), 0);

        // Get quote for the message
        fee = _quote(
            bridgeConfig.remoteEid,
            message,
            options,
            false // payInLzToken
        );

        if (onlyQuote) {
            return (MessagingReceipt(0, 0, fee), fee);
        }

        // Check if contract has enough ETH
        _requireSufficientETH(fee.nativeFee);

        // Send the message using the external send function with ETH from contract
        receipt = this._sendMessageWithETH{value: fee.nativeFee}(bridgeConfig.remoteEid, message, options, fee);

        return (receipt, fee);
    }

    // External function to send LayerZero messages with ETH from contract balance
    function _sendMessageWithETH(uint32 _dstEid, bytes memory _message, bytes memory _options, MessagingFee memory _fee)
        external
        payable
        returns (MessagingReceipt memory)
    {
        if (msg.sender != address(this)) {
            revert OnlySelfCallAllowed(msg.sender);
        }
        return _lzSend(_dstEid, _message, _options, _fee, payable(address(this)));
    }

    // ============ View Functions ============
    function getMarketAssertionId(bytes32 marketId) external view returns (bytes32) {
        return marketIdToAssertionId[marketId];
    }

    function getAssertionMarketId(bytes32 assertionId) external view returns (bytes32) {
        return assertionIdToMarketId[assertionId];
    }

    function getConfig() external view returns (Settings memory) {
        return config;
    }

    function _lzReceive(Origin calldata _origin, bytes32, bytes calldata _message, address, bytes calldata)
        internal
        override {
        // Do nothing, this is just to satisfy the OApp interface
    }
}
