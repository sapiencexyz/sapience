// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ManualConditionResolver
} from "../../resolvers/mocks/ManualConditionResolver.sol";

/// @title Deploy Manual Condition Resolver
/// @notice Deploys a ManualConditionResolver for testing predictions
contract DeployResolver is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");

        console.log("=== Deploy Manual Condition Resolver ===");
        console.log("Owner:", deployer);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        ManualConditionResolver resolver = new ManualConditionResolver(deployer);

        // Approve deployer as settler so they can resolve conditions
        resolver.approveSettler(deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("ManualConditionResolver:", address(resolver));
        console.log("Approved Settler:", deployer);
        console.log("");
        console.log("Add to .env:");
        console.log("RESOLVER_ADDRESS=", address(resolver));
    }
}
