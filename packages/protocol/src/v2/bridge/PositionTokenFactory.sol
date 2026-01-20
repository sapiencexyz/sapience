// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { CREATE3 } from "solady/utils/CREATE3.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./BridgedPositionToken.sol";

/// @title PositionTokenFactory
/// @notice Factory for deploying bridged position tokens using CREATE3
/// @dev Ensures deterministic addresses across chains
contract PositionTokenFactory is IPositionTokenFactory, Ownable {
    /// @notice Address authorized to deploy tokens (bridge)
    address public deployer;

    /// @notice Modifier to restrict deployment to authorized deployer
    modifier onlyDeployer() {
        if (msg.sender != deployer && msg.sender != owner()) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address owner_) Ownable(owner_) { }

    /// @notice Set the authorized deployer (bridge)
    /// @param deployer_ The deployer address
    function setDeployer(address deployer_) external onlyOwner {
        deployer = deployer_;
    }

    /// @inheritdoc IPositionTokenFactory
    function deploy(
        bytes32 pickConfigId,
        bool isPredictorToken,
        string calldata name,
        string calldata symbol,
        address, // recipient - unused, minting done by bridge
        address burner
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
                type(BridgedPositionToken).creationCode,
                abi.encode(name, symbol, pickConfigId, isPredictorToken, burner)
            ),
            salt
        );

        emit TokenDeployed(pickConfigId, isPredictorToken, token, salt);
    }

    /// @inheritdoc IPositionTokenFactory
    function predictAddress(bytes32 pickConfigId, bool isPredictorToken)
        public
        view
        returns (address)
    {
        bytes32 salt = computeSalt(pickConfigId, isPredictorToken);
        return CREATE3.predictDeterministicAddress(salt, address(this));
    }

    /// @inheritdoc IPositionTokenFactory
    function computeSalt(bytes32 pickConfigId, bool isPredictorToken)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(pickConfigId, isPredictorToken));
    }

    /// @inheritdoc IPositionTokenFactory
    function isDeployed(bytes32 pickConfigId, bool isPredictorToken)
        external
        view
        returns (bool)
    {
        address predicted = predictAddress(pickConfigId, isPredictorToken);
        return predicted.code.length > 0;
    }

    // ============ Ownership Management ============

    /// @inheritdoc IPositionTokenFactory
    function isConfigComplete() external view returns (bool) {
        return deployer != address(0);
    }

    /// @inheritdoc IPositionTokenFactory
    function renounceOwnershipSafe() external onlyOwner {
        require(this.isConfigComplete(), "Config incomplete");
        renounceOwnership();
    }
}
