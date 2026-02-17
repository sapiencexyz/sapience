// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../../src/predictionMarket/interfaces/IPredictionStructs.sol";

contract MockResolver is IPredictionMarketResolver {
    bool public shouldValidate = true;
    bool public predictionSuccess = true;
    Error public validationError = Error.NO_ERROR;
    Error public resolutionError = Error.NO_ERROR;

    function setShouldValidate(bool _shouldValidate) external {
        shouldValidate = _shouldValidate;
    }

    function setPredictionSuccess(bool _predictionSuccess) external {
        predictionSuccess = _predictionSuccess;
    }

    function setValidationResult(bool _shouldValidate, Error _error) external {
        shouldValidate = _shouldValidate;
        validationError = _error;
    }

    function setResolutionResult(
        bool _isResolved,
        Error _error,
        bool _predictionSuccess
    ) external {
        shouldValidate = _isResolved;
        resolutionError = _error;
        predictionSuccess = _predictionSuccess;
    }

    function validatePredictionMarkets(bytes calldata)
        external
        view
        returns (bool, Error)
    {
        return (shouldValidate, validationError);
    }

    function getPredictionResolution(bytes calldata)
        external
        view
        returns (bool, Error, bool)
    {
        return (shouldValidate, resolutionError, predictionSuccess);
    }
}
