// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library Encoder {
    uint16 constant CMD_TO_UMA_ASSERT_TRUTH = 1;
    uint16 constant CMD_FROM_UMA_RESOLVED_CALLBACK = 2;
    uint16 constant CMD_FROM_UMA_DISPUTED_CALLBACK = 3;

    uint16 constant CMD_FROM_ESCROW_DEPOSIT = 4;
    uint16 constant CMD_FROM_ESCROW_INTENT_TO_WITHDRAW = 5;
    uint16 constant CMD_FROM_ESCROW_WITHDRAW = 6;
    uint16 constant CMD_FROM_ESCROW_BOND_SENT = 7;
    uint16 constant CMD_FROM_ESCROW_BOND_RECEIVED = 8;
    uint16 constant CMD_FROM_ESCROW_BOND_LOST_DISPUTE = 9;



    function encodeType(uint16 commandType, bytes memory data) internal pure returns (bytes memory) {
        return abi.encodePacked(commandType, data);
    }

    function decodeType(bytes memory data) internal pure returns (uint16, bytes memory) {
        return abi.decode(data, (uint16, bytes));
    }

    // To UMA commands
    function encodeToUMAAssertTruth(uint256 assertionId, address asserter, uint64 liveness, address currency, uint256 bond, bytes memory claim) internal pure returns (bytes memory) {
        return abi.encode(assertionId, asserter, liveness, currency, bond, claim);
    }

    function decodeToUMAAssertTruth(bytes memory data) internal pure returns (uint256, address, uint64, address, uint256, bytes memory) {
        return abi.decode(data, (uint256, address, uint64, address, uint256, bytes));
    }

    // From UMA commands
    function encodeFromUMAResolved(uint256 assertionId, bool truthfully) internal pure returns (bytes memory) {
        return abi.encode(assertionId, truthfully);
    }

    function decodeFromUMAResolved(bytes memory data) internal pure returns (uint256, bool) {
        return abi.decode(data, (uint256, bool));
    }

    function encodeFromUMADisputed(uint256 assertionId) internal pure returns (bytes memory) {
        return abi.encode(assertionId);
    }

    function decodeFromUMADisputed(bytes memory data) internal pure returns (uint256) {
        return abi.decode(data, (uint256));
    }

    // Forward from Bridge Bond Balance commands
    function encodeFromBalanceUpdate(address submitter, address bondToken, uint256 finalAmount, uint256 deltaAmount) internal pure returns (bytes memory) {
        return abi.encode(submitter, bondToken, finalAmount, deltaAmount);
    }

    function decodeFromBalanceUpdate(bytes memory data) internal pure returns (address, address, uint256, uint256) {
        return abi.decode(data, (address, address, uint256, uint256));
    }
}
