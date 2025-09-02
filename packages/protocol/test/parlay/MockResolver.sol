// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/parlay/interfaces/IParlayPoolResolver.sol";
import "../../src/parlay/interfaces/IParlayStructs.sol";

contract MockResolver is IParlayPoolResolver {
    bool public shouldValidate = true;
    bool public makerWon = true;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function setMakerWon(bool _makerWon) external {
        makerWon = _makerWon;
    }

    function validateParlayMarkets(
        IParlayStructs.PredictedOutcome[] calldata
    ) external view returns (bool, Error) {
        return (shouldValidate, Error.NO_ERROR);
    }

    function resolveParlay(
        IParlayStructs.PredictedOutcome[] calldata
    ) external view returns (bool, Error, bool) {
        // Mock implementation - does nothing
        return (shouldValidate, Error.NO_ERROR, makerWon);
    }
}
