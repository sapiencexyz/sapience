// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { CREATE3 } from "solady/utils/CREATE3.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPredictionMarketTokenFactory.sol";
import "./PredictionMarketToken.sol";

/// @title PredictionMarketTokenFactory
/// @notice Factory for deploying position tokens using CREATE3
/// @dev Ensures deterministic addresses across chains
contract PredictionMarketTokenFactory is
    IPredictionMarketTokenFactory,
    Ownable
{
    /// @notice Address authorized to deploy tokens (escrow or bridge)
    address public deployer;

    /// @notice Modifier to restrict deployment to authorized deployer
    modifier onlyDeployer() {
        if (msg.sender != deployer && msg.sender != owner()) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address owner_) Ownable(owner_) { }

    /// @notice Set the authorized deployer
    /// @param deployer_ The deployer address
    function setDeployer(address deployer_) external onlyOwner {
        deployer = deployer_;
    }

    /// @inheritdoc IPredictionMarketTokenFactory
    function deploy(
        bytes32 pickConfigId,
        bool isPredictorToken,
        string calldata name,
        string calldata symbol,
        address authority
    ) external onlyDeployer returns (address token) {
        bytes32 salt = computeSalt(pickConfigId, isPredictorToken);

        // Check if already deployed
        if (
            CREATE3.predictDeterministicAddress(salt, address(this)).code.length
                > 0
        ) {
            revert TokenAlreadyExists(CREATE3.predictDeterministicAddress(
                    salt, address(this)
                ));
        }

        // Deploy using CREATE3
        token = CREATE3.deployDeterministic(
            abi.encodePacked(
                type(PredictionMarketToken).creationCode,
                abi.encode(
                    name, symbol, pickConfigId, isPredictorToken, authority
                )
            ),
            salt
        );

        emit TokenDeployed(pickConfigId, isPredictorToken, token, salt);
    }

    /// @inheritdoc IPredictionMarketTokenFactory
    function predictAddress(bytes32 pickConfigId, bool isPredictorToken)
        public
        view
        returns (address)
    {
        bytes32 salt = computeSalt(pickConfigId, isPredictorToken);
        return CREATE3.predictDeterministicAddress(salt, address(this));
    }

    /// @inheritdoc IPredictionMarketTokenFactory
    function computeSalt(bytes32 pickConfigId, bool isPredictorToken)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(pickConfigId, isPredictorToken));
    }

    /// @inheritdoc IPredictionMarketTokenFactory
    function isDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool)
    {
        address predicted = predictAddress(pickConfigId, isPredictorToken);
        return predicted.code.length > 0;
    }

    // ============ Ownership Management ============

    /// @inheritdoc IPredictionMarketTokenFactory
    function isConfigComplete() external view returns (bool) {
        return deployer != address(0);
    }

    /// @inheritdoc IPredictionMarketTokenFactory
    function renounceOwnershipSafe() external onlyOwner {
        require(this.isConfigComplete(), "Config incomplete");
        renounceOwnership();
    }
}
