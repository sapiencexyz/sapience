// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library CommandEncodeDecode {
    uint16 constant COMMAND_TYPE_FORWARD_TO_UMA_ASSERT_TRUTH = 1;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_UMA_VERIFICATION = 2;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_UMA_DISPUTE = 3;

    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_DEPOSIT = 4;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_INTENT_TO_WITHDRAW = 5;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_WITHDRAW = 6;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_SENT = 7;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_RECEIVED = 8;
    uint16 constant COMMAND_TYPE_FORWARD_FROM_ESCROW_BOND_LOST_DISPUTE = 9;

    function encodeCommandType(uint16 commandType, bytes memory data) internal pure returns (bytes memory) {
        return abi.encodePacked(commandType, data);
    }

    function decodeCommandType(bytes memory data) internal pure returns (uint16, bytes memory) {
        return abi.decode(data, (uint16, bytes));
    }

    // Forward to UMA commands
    function encodeForwardToUMAAssertionTruthCommand(bytes memory claim, address asserter, address callbackRecipient, address escalationManager) internal pure returns (bytes memory) {
        return abi.encodePacked(claim, asserter, callbackRecipient, escalationManager);
    }

    function decodeForwardToUMAAssertionTruthCommand(bytes memory data) internal pure returns (bytes memory, address, address, address) {
        return abi.decode(data, (bytes, address, address, address));
    }

    // Forward from UMA commands
    function encodeForwardFromUMAVerificationCommand(uint256 assertionId, bool verified) internal pure returns (bytes memory) {
        return abi.encodePacked(assertionId, verified);
    }

    function decodeForwardFromUMAVerificationCommand(bytes memory data) internal pure returns (uint256, bool) {
        return abi.decode(data, (uint256, bool));
    }

    function encodeForwardFromUMADisputeCommand(uint256 assertionId) internal pure returns (bytes memory) {
        return abi.encodePacked(assertionId);
    }

    function decodeForwardFromUMADisputeCommand(bytes memory data) internal pure returns (uint256) {
        return abi.decode(data, (uint256));
    }

    // Forward from Bridge Bond Balance commands
    function encodeForwardFromEscrowDepositCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowDepositCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    function encodeForwardFromEscrowIntentToWithdrawCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowIntentToWithdrawCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    function encodeForwardFromEscrowWithdrawCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowWithdrawCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    function encodeForwardFromEscrowBondSentCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowBondSentCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    function encodeForwardFromEscrowBondReceivedCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowBondReceivedCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    function encodeForwardFromEscrowBondLostDisputeCommand(address submitter, address bondToken, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(submitter, bondToken, amount);
    }

    function decodeForwardFromEscrowBondLostDisputeCommand(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }
}
