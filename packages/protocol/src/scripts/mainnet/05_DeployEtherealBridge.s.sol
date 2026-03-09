// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";

/// @title Deploy PredictionMarketBridge (Mainnet)
/// @notice Deploy bridge on PM Network (Ethereal mainnet - source chain)
contract DeployEtherealBridge is Script {
    function run() external {
        address endpoint = vm.envAddress("PM_NETWORK_LZ_ENDPOINT");
        address owner = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");

        console.log(
            "=== Deploy PredictionMarketBridge on PM Network (Mainnet) ==="
        );
        console.log("LZ Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Factory:", factoryAddr);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PredictionMarketBridge bridge =
            new PredictionMarketBridge(endpoint, owner, factoryAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketBridge:", address(bridge));
        console.log("");
        console.log("Add to .env:");
        console.log("PM_NETWORK_BRIDGE_ADDRESS=", address(bridge));
    }
}
