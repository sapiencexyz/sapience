// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketTokenFactory
} from "../../PredictionMarketTokenFactory.sol";

/// @title Deploy PredictionMarketTokenFactory on SM Network (Mainnet)
/// @notice Deploy factory on Arbitrum mainnet using CREATE2 for deterministic address
/// @dev Uses Arachnid CREATE2 proxy to ensure same factory address across chains.
///      DEPLOYER_ADDRESS must be the same address used on PM Network deployment.
contract DeployFactorySM is Script {
    /// @dev Arachnid deterministic deployment proxy (same address on all EVM chains)
    address constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev Default salt for factory deployment (same on both chains)
    bytes32 constant DEFAULT_FACTORY_SALT =
        keccak256("sapience-prediction-market-token-factory-v1");

    function run() external {
        // DEPLOYER_ADDRESS must be the same on both chains for same CREATE2 address
        address owner = vm.envAddress("DEPLOYER_ADDRESS");
        bytes32 salt = vm.envOr("FACTORY_SALT", DEFAULT_FACTORY_SALT);

        bytes memory initCode = abi.encodePacked(
            type(PredictionMarketTokenFactory).creationCode, abi.encode(owner)
        );

        // Predict deterministic address
        address predicted = _predictCreate2(salt, initCode);

        console.log(
            "=== Deploy PredictionMarketTokenFactory SM Network (Mainnet) ==="
        );
        console.log("Owner:", owner);
        console.log("Salt:", vm.toString(salt));
        console.log("Expected address:", predicted);

        // Check if already deployed
        if (predicted.code.length > 0) {
            console.log("");
            console.log("Factory already deployed at this address!");
            console.log("FACTORY_ADDRESS=", predicted);
            return;
        }

        // Verify CREATE2 proxy exists
        require(
            CREATE2_PROXY.code.length > 0,
            "CREATE2 proxy not deployed on this chain"
        );

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // Deploy via CREATE2 proxy: calldata = salt ++ initCode
        (bool success,) = CREATE2_PROXY.call(abi.encodePacked(salt, initCode));
        require(success, "CREATE2 deployment failed");

        vm.stopBroadcast();

        // Verify deployment
        require(predicted.code.length > 0, "Deployment verification failed");

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketTokenFactory:", predicted);
        console.log("");
        console.log("Add to .env:");
        console.log("FACTORY_ADDRESS=", predicted);
    }

    function _predictCreate2(bytes32 salt, bytes memory initCode)
        internal
        pure
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            CREATE2_PROXY,
                            salt,
                            keccak256(initCode)
                        )
                    )
                )
            )
        );
    }
}
