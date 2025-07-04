// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {IBondManagement} from "../interfaces/ILayerZeroBridge.sol";
import {BridgeTypes} from "../BridgeTypes.sol";

/**
 * @title BondManagement
 * @notice Abstract contract for bond token management
 * @dev This contract provides common functionality for:
 * - Depositing bond tokens to escrow
 * - Creating withdrawal intents
 * - Executing withdrawals after delay period
 * - Managing bond balances and withdrawal intents
 * - Emitting bond-related events
 */
abstract contract BondManagement is ReentrancyGuard, IBondManagement {
    using SafeERC20 for IERC20;
    using BridgeTypes for BridgeTypes.WithdrawalIntent;

    uint256 public constant WITHDRAWAL_DELAY = 1 days;

    // State variables
    mapping(address => mapping(address => uint256)) internal submitterBondBalances; // submitter => bondToken => balance
    mapping(address => mapping(address => BridgeTypes.WithdrawalIntent)) internal withdrawalIntents; // submitter => bondToken => intent

    /**
     * @notice Deposit bond tokens to escrow
     * @param bondToken The bond token address
     * @param amount The amount to deposit
     * @return receipt The messaging receipt
     */
    function depositBond(address bondToken, uint256 amount)
        external
        virtual
        nonReentrant
        returns (MessagingReceipt memory)
    {
        require(bondToken != address(0), "Bond token cannot be zero address");

        require(amount > 0, "Amount must be greater than 0");

        IERC20(bondToken).safeTransferFrom(msg.sender, address(this), amount);

        MessagingReceipt memory receipt = _sendBalanceUpdate(
            _getDepositCommandType(), msg.sender, bondToken, submitterBondBalances[msg.sender][bondToken], amount
        );

        submitterBondBalances[msg.sender][bondToken] += amount;

        emit BondDeposited(msg.sender, bondToken, amount);

        return receipt;
    }

    /**
     * @notice Create intent to withdraw bond tokens
     * @param bondToken The bond token address
     * @param amount The amount to withdraw
     * @return receipt The messaging receipt
     */
    function intentToWithdrawBond(address bondToken, uint256 amount)
        external
        virtual
        nonReentrant
        returns (MessagingReceipt memory)
    {
        require(bondToken != address(0), "Bond token cannot be zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(submitterBondBalances[msg.sender][bondToken] >= amount, "Insufficient balance");
        require(withdrawalIntents[msg.sender][bondToken].amount == 0, "Withdrawal intent already exists");

        MessagingReceipt memory receipt = _sendBalanceUpdate(
            _getIntentToWithdrawCommandType(),
            msg.sender,
            bondToken,
            submitterBondBalances[msg.sender][bondToken],
            amount
        );

        withdrawalIntents[msg.sender][bondToken] =
            BridgeTypes.WithdrawalIntent({amount: amount, timestamp: block.timestamp, executed: false});

        emit BondWithdrawalIntentCreated(msg.sender, bondToken, amount, block.timestamp);

        return receipt;
    }

    /**
     * @notice Execute withdrawal after delay period
     * @param bondToken The bond token address
     * @return receipt The messaging receipt
     */
    function executeWithdrawal(address bondToken) external virtual nonReentrant returns (MessagingReceipt memory) {
        require(bondToken != address(0), "Bond token cannot be zero address");
        BridgeTypes.WithdrawalIntent storage intent = withdrawalIntents[msg.sender][bondToken];
        require(intent.amount > 0, "No withdrawal intent");
        require(!intent.executed, "Withdrawal already executed");
        require(block.timestamp >= intent.timestamp + WITHDRAWAL_DELAY, "Waiting period not over");
        require(submitterBondBalances[msg.sender][bondToken] >= intent.amount, "Insufficient balance");

        MessagingReceipt memory receipt = _sendBalanceUpdate(
            _getWithdrawCommandType(),
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

    /**
     * @notice Get bond balance for a submitter and token
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @return The bond balance
     */
    function getBondBalance(address submitter, address bondToken) external view returns (uint256) {
        return submitterBondBalances[submitter][bondToken];
    }

    /**
     * @notice Get pending withdrawal for a submitter and token
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @return amount The withdrawal amount
     * @return timestamp The withdrawal timestamp
     */
    function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256) {
        BridgeTypes.WithdrawalIntent storage intent = withdrawalIntents[submitter][bondToken];
        return (intent.amount, intent.timestamp);
    }

    /**
     * @notice Get bond balance (internal)
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @return The bond balance
     */
    function _getBondBalance(address submitter, address bondToken) internal view returns (uint256) {
        return submitterBondBalances[submitter][bondToken];
    }

    /**
     * @notice Get withdrawal intent (internal)
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @return The withdrawal intent
     */
    function _getWithdrawalIntent(address submitter, address bondToken)
        internal
        view
        returns (BridgeTypes.WithdrawalIntent storage)
    {
        return withdrawalIntents[submitter][bondToken];
    }

    /**
     * @notice Update bond balance (internal)
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @param amount The amount to add/subtract
     * @param isAddition Whether to add or subtract the amount
     */
    function _updateBondBalance(address submitter, address bondToken, uint256 amount, bool isAddition) internal {
        if (isAddition) {
            submitterBondBalances[submitter][bondToken] += amount;
        } else {
            submitterBondBalances[submitter][bondToken] -= amount;
        }
    }

    /**
     * @notice Abstract function to send balance update
     * @param commandType The command type
     * @param submitter The submitter address
     * @param bondToken The bond token address
     * @param finalAmount The final balance amount
     * @param deltaAmount The change in amount
     * @return receipt The messaging receipt
     */
    function _sendBalanceUpdate(
        uint16 commandType,
        address submitter,
        address bondToken,
        uint256 finalAmount,
        uint256 deltaAmount
    ) internal virtual returns (MessagingReceipt memory);

    /**
     * @notice Get deposit command type
     * @return The command type for deposit
     */
    function _getDepositCommandType() internal pure virtual returns (uint16);

    /**
     * @notice Get intent to withdraw command type
     * @return The command type for intent to withdraw
     */
    function _getIntentToWithdrawCommandType() internal pure virtual returns (uint16);

    /**
     * @notice Get withdraw command type
     * @return The command type for withdraw
     */
    function _getWithdrawCommandType() internal pure virtual returns (uint16);
}
