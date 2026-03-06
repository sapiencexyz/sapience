// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";

/// @title Deploy PredictionMarketBridgeRemote (Mainnet)
/// @notice Deploy bridge on SM Network (Arbitrum mainnet - remote chain)
contract DeployRemoteBridge is Script {
    function run() external {
        address endpoint = vm.envAddress("SM_NETWORK_LZ_ENDPOINT");
        address owner = vm.envAddress("SM_NETWORK_DEPLOYER_ADDRESS");
        address factory = vm.envAddress("FACTORY_ADDRESS");

        console.log(
            "=== Deploy PredictionMarketBridgeRemote on SM Network (Mainnet) ==="
        );
        console.log("LZ Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Factory:", factory);

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PredictionMarketBridgeRemote bridge =
            new PredictionMarketBridgeRemote(endpoint, owner, factory);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketBridgeRemote:", address(bridge));
        console.log("");
        console.log("Add to .env:");
        console.log("SM_NETWORK_BRIDGE_ADDRESS=", address(bridge));
    }
}
