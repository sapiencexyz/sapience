// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../../src/predictionMarket/interfaces/IPredictionStructs.sol";

contract MockResolver is IPredictionMarketResolver {
    bool public shouldValidate = true;
    bool public parlaySuccess = true;
    Error public validationError = Error.NO_ERROR;
    Error public resolutionError = Error.NO_ERROR;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function setParlaySuccess(bool _parlaySuccess) external {
        parlaySuccess = _parlaySuccess;
    }

    function setValidationResult(bool _shouldValidate, Error _error) external {
        shouldValidate = _shouldValidate;
        validationError = _error;
    }

    function setResolutionResult(bool _isResolved, Error _error, bool _parlaySuccess) external {
        shouldValidate = _isResolved;
        resolutionError = _error;
        parlaySuccess = _parlaySuccess;
    }

    function validatePredictionMarkets(
        bytes calldata
    ) external view returns (bool, Error) {
        return (shouldValidate, validationError);
    }

    function getPredictionResolution(
        bytes calldata
    ) external view returns (bool, Error, bool) {
        return (shouldValidate, resolutionError, parlaySuccess);
    }
}
