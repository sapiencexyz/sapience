// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";

contract MockResolver is IPredictionMarketResolver {
    bool public shouldValidate = true;
    bool public makerWon = true;
    Error public validationError = Error.NO_ERROR;
    Error public resolutionError = Error.NO_ERROR;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function setMakerWon(bool _makerWon) external {
        makerWon = _makerWon;
    }

    function setValidationResult(bool _shouldValidate, Error _error) external {
        shouldValidate = _shouldValidate;
        validationError = _error;
    }

    function setResolutionResult(bool _isValid, Error _error, bool _makerWon) external {
        shouldValidate = _isValid;
        resolutionError = _error;
        makerWon = _makerWon;
    }

    function validatePredictionMarkets(
        bytes calldata
    ) external view returns (bool, Error) {
        return (shouldValidate, validationError);
    }

    function resolvePrediction(
        bytes calldata
    ) external view returns (bool, Error, bool) {
        return (shouldValidate, resolutionError, makerWon);
    }
}
