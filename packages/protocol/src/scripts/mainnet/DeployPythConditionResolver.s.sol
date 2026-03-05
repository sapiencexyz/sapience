// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PythConditionResolver
} from "../../resolvers/pyth/PythConditionResolver.sol";

/// @title Deploy PythConditionResolver (Mainnet)
/// @notice Deploys a PythConditionResolver on Ethereal mainnet
contract DeployPythConditionResolver is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address pythLazer = vm.envAddress("PYTH_LAZER_ADDRESS");

        console.log("=== Deploy PythConditionResolver (Mainnet) ===");
        console.log("Deployer:", deployer);
        console.log("Pyth Lazer:", pythLazer);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PythConditionResolver resolver = new PythConditionResolver(pythLazer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PythConditionResolver:", address(resolver));
        console.log("");
        console.log("Add to .env:");
        console.log("PYTH_CONDITION_RESOLVER_ADDRESS=", address(resolver));
    }
}
