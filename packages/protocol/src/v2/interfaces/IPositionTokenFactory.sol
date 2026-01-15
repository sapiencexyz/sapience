// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IPositionTokenFactory
 * @notice Interface for the factory that creates position token pairs
 * @dev Uses CREATE2 for deterministic addresses to enable same address on multiple chains
 */
interface IPositionTokenFactory {
    /// @notice Create a token pair for a new prediction
    /// @param predictionId The unique prediction identifier
    /// @param predictor Address to receive predictor tokens
    /// @param counterparty Address to receive counterparty tokens
    /// @return predictorToken Address of the created predictor token
    /// @return counterpartyToken Address of the created counterparty token
    function createTokenPair(bytes32 predictionId, address predictor, address counterparty)
        external
        returns (address predictorToken, address counterpartyToken);

    /// @notice Get the token pair for a prediction
    /// @param predictionId The prediction identifier
    /// @return tokenPair The predictor and counterparty token addresses
    function getTokenPair(bytes32 predictionId) external view returns (IV2Types.TokenPair memory tokenPair);

    /// @notice Compute deterministic token addresses before deployment
    /// @param predictionId The prediction identifier
    /// @return predictorToken Predicted address of predictor token
    /// @return counterpartyToken Predicted address of counterparty token
    function computeTokenAddresses(bytes32 predictionId)
        external
        view
        returns (address predictorToken, address counterpartyToken);

    /// @notice Get the prediction ID from a token address
    /// @param token The position token address
    /// @return predictionId The prediction this token belongs to
    function getPredictionId(address token) external view returns (bytes32 predictionId);

    /// @notice Check if an address is a valid position token
    /// @param token The address to check
    /// @return isValid True if the address is a position token from this factory
    function isPositionToken(address token) external view returns (bool isValid);

    /// @notice Check if a token is a predictor token (vs counterparty)
    /// @param token The position token address
    /// @return isPredictor True if the token is a predictor token
    function isPredictorToken(address token) external view returns (bool isPredictor);
}
