// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ConditionalTokensConditionResolver
} from "../../resolvers/conditionalTokens/ConditionalTokensConditionResolver.sol";

/// @title Deploy ConditionalTokensConditionResolver (Mainnet)
/// @notice Deploys ConditionalTokensConditionResolver on Ethereal mainnet
/// @dev Receives resolution data from ConditionalTokensReader on Polygon via LayerZero
contract DeployConditionalTokensConditionResolver is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address lzEndpoint = vm.envAddress("PM_NETWORK_LZ_ENDPOINT");

        console.log(
            "=== Deploy ConditionalTokensConditionResolver (Mainnet) ==="
        );
        console.log("Owner:", deployer);
        console.log("LZ Endpoint:", lzEndpoint);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        ConditionalTokensConditionResolver resolver =
            new ConditionalTokensConditionResolver(lzEndpoint, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("ConditionalTokensConditionResolver:", address(resolver));
        console.log("");
        console.log("Add to .env:");
        console.log("CT_CONDITION_RESOLVER_ADDRESS=", address(resolver));
        console.log("");
        console.log("Next: Deploy ConditionalTokensReader on Polygon,");
        console.log("then run ConfigureCTBridge to wire both sides together.");
    }
}
