// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/parlay/interfaces/IParlayPoolResolver.sol";
import "../../src/parlay/interfaces/IParlayStructs.sol";

contract MockResolver is IParlayPoolResolver {
    bool public shouldValidate = true;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function validateParlayMarkets(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        bool syncCall
    ) external returns (bool) {
        return shouldValidate;
    }

    function resolveParlay() external {
        // Mock implementation - does nothing
    }
}
