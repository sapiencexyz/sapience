// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title IBondManagement
 * @notice Interface for bond management functionality in LayerZero bridges
 */
interface IBondManagement {
    // Custom errors
    error InsufficientBalance(address submitter, address bondToken, uint256 requested, uint256 available);
    error AmountBelowMinimum(uint256 amount, uint256 minimumAmount);
    error InvalidBondToken(address bondToken);
    error BondTokenZeroAddress();
    error AmountMustBeGreaterThanZero(uint256 amount);
    error WithdrawalIntentAlreadyExists(address submitter, address bondToken);
    error CooldownPeriodNotOver(uint256 currentTime, uint256 requiredTime);
    error NoWithdrawalIntent(address submitter, address bondToken);
    error WithdrawalAlreadyExecuted(address submitter, address bondToken);
    error WaitingPeriodNotOver(uint256 currentTime, uint256 requiredTime);

    // Events
    event BondDeposited(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );
    event BondWithdrawalIntentCreated(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount,
        uint256 timestamp
    );
    event BondWithdrawalIntentRemoved(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );
    event WithdrawalExecuted(
        address indexed submitter,
        address indexed bondToken,
        uint256 amount
    );

    // Functions
    function depositBond(
        address bondToken,
        uint256 amount
    ) external returns (MessagingReceipt memory);
    function intentToWithdrawBond(
        address bondToken,
        uint256 amount
    ) external returns (MessagingReceipt memory);
    function removeWithdrawalIntent(
        address bondToken
    ) external returns (MessagingReceipt memory);
    function executeWithdrawal(
        address bondToken
    ) external returns (MessagingReceipt memory);
    function getBondBalance(
        address submitter,
        address bondToken
    ) external view returns (uint256);
    function getPendingWithdrawal(
        address submitter,
        address bondToken
    ) external view returns (uint256, uint256);
} 