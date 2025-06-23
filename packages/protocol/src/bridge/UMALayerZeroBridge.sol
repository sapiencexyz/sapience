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
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
// import {console2} from "forge-std/console2.sol";
import {BridgeTypes} from "./BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

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
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    uint256 public constant WITHDRAWAL_DELAY = 1 days;

    // State variables
    BridgeTypes.BridgeConfig private bridgeConfig;
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
    function setOptimisticOracleV3(
        address _optimisticOracleV3
    ) external onlyOwner {
        optimisticOracleV3Address = _optimisticOracleV3;
    }

    function setBridgeConfig(
        BridgeTypes.BridgeConfig calldata newConfig
    ) external onlyOwner {
        bridgeConfig = newConfig;
        emit BridgeConfigUpdated(newConfig);
    }

    function getOptimisticOracleV3() external view returns (address) {
        return optimisticOracleV3Address;
    }

    function getBridgeConfig()
        external
        view
        returns (BridgeTypes.BridgeConfig memory)
    {
        return bridgeConfig;
    }

    // ETH Management for fees
    function depositETH() external payable {
        // Anyone can deposit ETH to help pay for fees
        emit ETHDeposited(msg.sender, msg.value);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");

        payable(owner()).transfer(amount);
        emit ETHWithdrawn(owner(), amount);

        // Check gas thresholds after withdrawal
        _checkGasThresholds();
    }

    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Receive function to accept ETH
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }

    // Bond Management Functions
    function depositBond(
        address bondToken,
        uint256 amount
    ) external nonReentrant returns (MessagingReceipt memory) {
        require(amount > 0, "Amount must be greater than 0");

        IERC20(bondToken).safeTransferFrom(msg.sender, address(this), amount);
        
        MessagingReceipt memory receipt = _sendBalanceUpdate(
            Encoder.CMD_FROM_ESCROW_DEPOSIT,
            msg.sender,
            bondToken,
            submitterBondBalances[msg.sender][bondToken],
            amount
        );
        
        submitterBondBalances[msg.sender][bondToken] += amount;
        
        emit BondDeposited(msg.sender, bondToken, amount);
        
        return receipt;
    }

    function intentToWithdrawBond(
        address bondToken,
        uint256 amount
    ) external nonReentrant returns (MessagingReceipt memory) {
        require(amount > 0, "Amount must be greater than 0");
        require(
            submitterBondBalances[msg.sender][bondToken] >= amount,
            "Insufficient balance"
        );
        require(
            withdrawalIntents[msg.sender][bondToken].amount == 0,
            "Withdrawal intent already exists"
        );

        MessagingReceipt memory receipt = _sendBalanceUpdate(
            Encoder.CMD_FROM_ESCROW_INTENT_TO_WITHDRAW,
            msg.sender,
            bondToken,
            submitterBondBalances[msg.sender][bondToken],
            amount
        );

        withdrawalIntents[msg.sender][bondToken] = WithdrawalIntent({
            amount: amount,
            timestamp: block.timestamp,
            executed: false
        });

        emit BondWithdrawalIntentCreated(msg.sender, bondToken, amount, block.timestamp);

        return receipt;
    }

    function executeWithdrawal(address bondToken) external nonReentrant returns (MessagingReceipt memory) {
        WithdrawalIntent storage intent = withdrawalIntents[msg.sender][
            bondToken
        ];
        require(intent.amount > 0, "No withdrawal intent");
        require(!intent.executed, "Withdrawal already executed");
        require(block.timestamp >= intent.timestamp + WITHDRAWAL_DELAY, "Waiting period not over");
        require(submitterBondBalances[msg.sender][bondToken] >= intent.amount, "Insufficient balance");

        MessagingReceipt memory receipt = _sendBalanceUpdate(
            Encoder.CMD_FROM_ESCROW_WITHDRAW,
            msg.sender,
            bondToken,
            submitterBondBalances[msg.sender][bondToken],
            intent.amount
        );

        intent.executed = true;
        submitterBondBalances[msg.sender][bondToken] -= intent.amount;

        emit WithdrawalExecuted(msg.sender, bondToken, intent.amount);

        IERC20(bondToken).safeTransfer(msg.sender, intent.amount);

        return receipt;
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
    ) external returns (MessagingReceipt memory) {
        AssertionMarketData storage marketData = assertionIdToMarketData[
            assertionId
        ];
        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMAResolved(
            marketData.bridgeAssertionId,
            assertedTruthfully
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            Encoder.CMD_FROM_UMA_RESOLVED_CALLBACK,
            commandPayload,false
        );

        submitterBondBalances[marketData.submitter][
            marketData.bondToken
        ] += marketData.bondAmount;

        return receipt;
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external nonReentrant returns (MessagingReceipt memory) {
        AssertionMarketData storage marketData = assertionIdToMarketData[
            assertionId
        ];
        if (marketData.bridgeAssertionId == 0) {
            revert("Invalid assertion ID");
        }

        // Make assertion data to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMADisputed(
            marketData.bridgeAssertionId
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            Encoder.CMD_FROM_UMA_DISPUTED_CALLBACK,
            commandPayload,false
        );

        // We don't need to update the balance since it was already deducted when the assertion was submitted

        return receipt;
    }

    function _sendBalanceUpdate(
        uint16 updateType,
        address submitter,
        address bondToken,
        uint256 finalAmount,
        uint256 deltaAmount
    ) internal returns (MessagingReceipt memory) {
        // Make balance update data for UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromBalanceUpdate(
            submitter,
            bondToken,
            finalAmount,
            deltaAmount
        );

        // Send message using contract's ETH balance
        (MessagingReceipt memory receipt, ) = _sendLayerZeroMessageWithQuote(
            updateType,
            commandPayload,false    
        );

        return receipt;
    }

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

    // Helper function to check gas thresholds and emit alerts
    function _checkGasThresholds() internal {
        uint256 currentBalance = address(this).balance;

        if (currentBalance <= CRITICAL_GAS_THRESHOLD) {
            emit GasReserveCritical(currentBalance);
        } else if (currentBalance <= WARNING_GAS_THRESHOLD) {
            emit GasReserveLow(currentBalance);
        }
    }

    // Helper function to send LayerZero messages with quote
    function _sendLayerZeroMessageWithQuote(
        uint16 commandCode,
        bytes memory commandPayload,
        bool onlyQuote
    ) internal returns (MessagingReceipt memory receipt, MessagingFee memory fee) {
        bytes memory message = abi.encode(commandCode, commandPayload);

        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorLzReceiveOption(5000000000, 0);

        // Get quote for the message
        fee = _quote(
            bridgeConfig.remoteChainId,
            message,
            options, // options
            false // payInLzToken
        );

        if (onlyQuote) {
            return (MessagingReceipt(0,0,fee), fee);
        }

        // Check if contract has enough ETH
        require(
            address(this).balance >= fee.nativeFee,
            "Insufficient ETH balance for fee"
        );

        // Check gas thresholds and emit alerts before sending
        _checkGasThresholds();

        // Send the message using the external send function with ETH from contract
        receipt = this._sendMessageWithETH{value: fee.nativeFee}(
            bridgeConfig.remoteChainId,
            message,
            options,
            fee
        );

        return (receipt, fee);
    }

    // External function to send LayerZero messages with ETH from contract balance
    function _sendMessageWithETH(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options,
        MessagingFee memory _fee
    ) external payable returns (MessagingReceipt memory) {
        require(msg.sender == address(this), "Only self-call allowed");
        return _lzSend(_dstEid, _message, _options, _fee, payable(address(this)));
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

        AssertionMarketData storage marketData = assertionIdToMarketData[
            umaAssertionId
        ];
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
