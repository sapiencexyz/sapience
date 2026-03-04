// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IPredictionMarketTokenFactory
/// @notice Interface for CREATE3-based position token factory
interface IPredictionMarketTokenFactory {
    // ============ Events ============

    /// @notice Emitted when a token is deployed
    event TokenDeployed(
        bytes32 indexed pickConfigId,
        bool indexed isPredictorToken,
        address token,
        bytes32 salt
    );

    // ============ Errors ============

    /// @notice Token already exists at computed address
    error TokenAlreadyExists(address token);

    /// @notice Deployment failed
    error DeploymentFailed();

    /// @notice Only authorized deployer can deploy
    error Unauthorized();

    // ============ Functions ============

    /// @notice Deploy a position token using CREATE3
    /// @param pickConfigId The prediction this token belongs to
    /// @param isPredictorToken True if this is the predictor token
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param authority Address authorized to mint/burn tokens
    /// @return token The deployed token address
    function deploy(
        bytes32 pickConfigId,
        bool isPredictorToken,
        string calldata name,
        string calldata symbol,
        address authority
    ) external returns (address token);

    /// @notice Predict the address of a token without deploying
    /// @param pickConfigId The prediction ID
    /// @param isPredictorToken True if predictor token
    /// @return The predicted token address
    function predictAddress(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (address);

    /// @notice Compute the salt for a token
    /// @param pickConfigId The prediction ID
    /// @param isPredictorToken True if predictor token
    /// @return The computed salt
    function computeSalt(bytes32 pickConfigId, bool isPredictorToken)
        external
        pure
        returns (bytes32);

    /// @notice Check if a token exists at the predicted address
    /// @param pickConfigId The prediction ID
    /// @param isPredictorToken True if predictor token
    /// @return True if token already deployed
    function isDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool);

    // ============ Ownership Management ============

    /// @notice Check if configuration is complete for safe ownership renouncement
    /// @return True if deployer is set
    function isConfigComplete() external view returns (bool);

    /// @notice Renounce ownership after verifying config is complete
    /// @dev Reverts if config is incomplete
    function renounceOwnershipSafe() external;
}
