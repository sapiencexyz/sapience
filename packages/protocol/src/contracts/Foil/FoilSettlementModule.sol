// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../../storage/Epoch.sol";
import "../../storage/Account.sol";
import "../../storage/Position.sol";

import "forge-std/console2.sol";

contract FoilSettlementModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;

    bytes32 public assertionId;
    address public asserter;
    uint256 public assertedFinalPrice;
    uint256 public finalPrice;
    OptimisticOracleV3Interface optimisticOracleV3;

    bytes public claim =
        abi.encodePacked(
            "...",
            " between timestamps ",
            //ClaimData.toUtf8BytesUint(startTime),
            " and ",
            //ClaimData.toUtf8BytesUint(endTime),
            ": "
            //ClaimData.toUtf8BytesUint(assertedFinalPrice)
        );

    function submitFinalPrice(
        uint finalPrice
    ) public returns (bytes32 assertionId) {
        Epoch.Data storage epoch = Epoch.load();
        require(msg.sender == asserter, "Only asserter can submit final price");
        require(
            block.timestamp >= epoch.endTime,
            "Cannot submit before end time"
        );
        assertedFinalPrice = finalPrice;
        assertionId = optimisticOracleV3.assertTruthWithDefaults(
            claim,
            msg.sender
        );
    }

    function settle() public {
        if (optimisticOracleV3.settleAndGetAssertionResult(assertionId)) {
            finalPrice = assertedFinalPrice;
        }
    }
}
