// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";

contract MockResolver is IPredictionMarketResolver {
    bool public shouldValidate = true;
    bool public makerWon = true;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function setMakerWon(bool _makerWon) external {
        makerWon = _makerWon;
    }

    function validatePredictionMarkets(
        bytes calldata
    ) external view returns (bool, Error) {
        return (shouldValidate, Error.NO_ERROR);
    }

    function resolvePrediction(
        bytes calldata
    ) external view returns (bool, Error, bool) {
        // Mock implementation - does nothing
        return (shouldValidate, Error.NO_ERROR, makerWon);
    }
}
