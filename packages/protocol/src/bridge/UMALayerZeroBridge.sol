// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import {IUMALayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {Encoder} from "./cmdEncoder.sol";

struct AssertionMarketData {
    bytes32 assertionId;
    uint256 bridgeAssertionId;
    address submitter;
    address bondToken;
    uint256 bondAmount;
}

/**
 * @title UMALayerZeroBridge
 * @notice Bridge contract deployed on the UMA network
 * @dev This contract:
 * 1. Receives settlement requests from Converge
 * 2. Interacts with UMA's OptimisticOracleV3
 * 3. Manages bond tokens and gas fees
 * 4. Sends verification results back to Converge
 */
contract UMALayerZeroBridge is OApp, ReentrancyGuard, IUMALayerZeroBridge {
    using SafeERC20 for IERC20;
    using Encoder for bytes;

    // State variables
    BridgeConfig private bridgeConfig;
    address private optimisticOracleV3Address;

    mapping(bytes32 => AssertionMarketData) private assertionIdToMarketData; // assertionId => marketData
    mapping(address => mapping(address => uint256))
        private submitterBondBalances; // submitter => bondToken => balance
    mapping(address => mapping(address => WithdrawalIntent))
        private withdrawalIntents; // submitter => bondToken => intent

    // Constants for gas monitoring
    uint256 public constant WARNING_GAS_THRESHOLD = 0.1 ether;
    uint256 public constant CRITICAL_GAS_THRESHOLD = 0.05 ether;

    // Constructor and initialization
    constructor(
        address _endpoint,
        address _owner
    ) OApp(_endpoint, _owner) Ownable(_owner) {}

    // Configuration functions
    function setOptimisticOracleV3(address _optimisticOracleV3) external onlyOwner {
        optimisticOracleV3Address = _optimisticOracleV3;
    }

    function setBridgeConfig(
        BridgeConfig calldata newConfig
    ) external onlyOwner {
        bridgeConfig = newConfig;
        emit BridgeConfigUpdated(newConfig);
    }

    function getOptimisticOracleV3() external view returns (address) {
        return optimisticOracleV3Address;
    }

    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return bridgeConfig;
    }

    // Bond Management Functions
    function depositBond(
        address bondToken,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        IERC20(bondToken).safeTransferFrom(msg.sender, address(this), amount);
        submitterBondBalances[msg.sender][bondToken] += amount;
        emit BondDeposited(msg.sender, bondToken, amount);
        // _sendBalanceUpdate(msg.sender, bondToken, submitterBondBalances[msg.sender][bondToken], BalanceUpdateType.DEPOSIT);
    }

    function intentToWithdrawBond(
        address bondToken,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(
            submitterBondBalances[msg.sender][bondToken] >= amount,
            "Insufficient balance"
        );
        require(
            withdrawalIntents[msg.sender][bondToken].amount == 0,
            "Withdrawal intent already exists"
        );

        withdrawalIntents[msg.sender][bondToken] = WithdrawalIntent({
            amount: amount,
            timestamp: block.timestamp,
            executed: false
        });

        // emit WithdrawalIntentCreated(msg.sender, bondToken, amount);
    }

    function executeWithdrawal(address bondToken) external nonReentrant {
        WithdrawalIntent storage intent = withdrawalIntents[msg.sender][
            bondToken
        ];
        require(intent.amount > 0, "No withdrawal intent");
        require(!intent.executed, "Withdrawal already executed");
        // require(block.timestamp >= intent.timestamp + bridgeConfig.withdrawalDelay, "Waiting period not over");

        uint256 amount = intent.amount;
        intent.executed = true;
        submitterBondBalances[msg.sender][bondToken] -= amount;

        IERC20(bondToken).safeTransfer(msg.sender, amount);
        emit WithdrawalExecuted(msg.sender, bondToken, amount);
        // _sendBalanceUpdate(msg.sender, bondToken, submitterBondBalances[msg.sender][bondToken], BalanceUpdateType.WITHDRAWAL);
    }

    function getBondBalance(
        address submitter,
        address bondToken
    ) external view returns (uint256) {
        return submitterBondBalances[submitter][bondToken];
    }

    function getPendingWithdrawal(
        address submitter,
        address bondToken
    ) external view returns (uint256, uint256) {
        WithdrawalIntent storage intent = withdrawalIntents[submitter][
            bondToken
        ];
        return (intent.amount, intent.timestamp);
    }

    // UMA callback functions
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        AssertionMarketData storage marketData = assertionIdToMarketData[assertionId];
        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMAResolved(marketData.bridgeAssertionId, assertedTruthfully);
        
        _sendLayerZeroMessage(
            Encoder.CMD_FROM_UMA_RESOLVED_CALLBACK,
            commandPayload,
            payable(msg.sender)
        );

        submitterBondBalances[marketData.submitter][marketData.bondToken] += marketData.bondAmount;
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external nonReentrant {
        AssertionMarketData storage marketData = assertionIdToMarketData[assertionId];
        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMADisputed(marketData.bridgeAssertionId);
        
        _sendLayerZeroMessage(
            Encoder.CMD_FROM_UMA_DISPUTED_CALLBACK,
            commandPayload,
            payable(msg.sender)
        );

        // We don't need to update the balance since it was already deducted when the assertion was submitted
    }

    // function validateSubmission(
    //     Epoch.Data storage epoch,
    //     Market.Data storage market,
    //     address caller
    // ) internal view {
    //     require(
    //         block.timestamp >= epoch.endTime,
    //         "Market epoch activity is still allowed"
    //     );
    //     require(!epoch.settled, "Market epoch already settled");
    //     require(caller == market.owner, "Only owner can call this function");
    // }

    // function validateUMACallback(
    //     Epoch.Data storage epoch,
    //     address caller,
    //     bytes32 assertionId
    // ) internal view {
    //     OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
    //             epoch.marketParams.optimisticOracleV3
    //         );

    //     require(
    //         block.timestamp > epoch.endTime,
    //         "Market epoch activity is still allowed"
    //     );
    //     require(!epoch.settled, "Market epoch already settled");
    //     require(caller == address(optimisticOracleV3), "Invalid caller");
    //     require(assertionId == epoch.assertionId, "Invalid assertionId");
    // }

    // LayerZero message handling
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        require(
            _origin.srcEid == bridgeConfig.remoteChainId,
            "Invalid source chain"
        );
        require(
            address(uint160(uint256(_origin.sender))) ==
                bridgeConfig.remoteBridge,
            "Invalid sender"
        );

        // TODO: Check if the sender is the remote bridge

        // Handle incoming messages from the UMA side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_TO_UMA_ASSERT_TRUTH) {
            _handleAssertTruthCmd(data);
        }
    }

    // Helper function to send LayerZero messages
    function _sendLayerZeroMessage(
        uint16 commandCode,
        bytes memory commandPayload,
        address payable refundAddress
    ) internal {
        bytes memory message = abi.encode(commandCode, commandPayload);
        
        _lzSend(
            bridgeConfig.remoteChainId,
            message,
            bytes(""), // options
            MessagingFee(msg.value, 0),
            refundAddress
        );
    }

    function _handleAssertTruthCmd(bytes memory data) internal {
            // Decode the data from the Market side (incoming data: assertionId, asserter, liveness, currency, bond, claim)
            (
                uint256 bridgeAssertionId,
                address asserter,
                uint64 liveness,
                address bondTokenAddress,
                uint256 bondAmount,
                bytes memory claim
            ) = data.decodeToUMAAssertTruth();

            // TODO: Check if the assertionId is already in the mapping and send back an error message
            // TODO: Check if the bond is enough and send back an error message

            OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                    optimisticOracleV3Address
                );

            IERC20 bondToken = IERC20(bondTokenAddress);

            bondToken.approve(address(optimisticOracleV3), bondAmount);

            bytes32 umaAssertionId = optimisticOracleV3.assertTruth(
                claim,
                asserter,
                address(this),
                address(0),
                liveness,
                bondToken,
                bondAmount,
                optimisticOracleV3.defaultIdentifier(),
                bytes32(0)
            );

            AssertionMarketData storage marketData = assertionIdToMarketData[umaAssertionId];
            marketData.bridgeAssertionId = bridgeAssertionId;
            marketData.submitter = asserter;
            marketData.bondToken = bondTokenAddress;
            marketData.bondAmount = bondAmount;
            marketData.assertionId = umaAssertionId;

            submitterBondBalances[asserter][bondTokenAddress] -= bondAmount;

            // TODO: Should we send back the confirmation to the Market side?

            // TODO: emit an event
    }

}
