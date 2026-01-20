// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";

/// @title Deploy PositionTokenBridge
/// @notice Deploy bridge on Ethereal (source chain)
contract DeployEtherealBridge is Script {
    function run() external {
        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address owner = vm.envAddress("DEPLOYER_ADDRESS");

        console.log("=== Deploy PositionTokenBridge on Ethereal ===");
        console.log("LZ Endpoint:", endpoint);
        console.log("Owner:", owner);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        PositionTokenBridge bridge = new PositionTokenBridge(endpoint, owner);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PositionTokenBridge:", address(bridge));
        console.log("");
        console.log("Add to .env:");
        console.log("ETHEREAL_BRIDGE_ADDRESS=", address(bridge));
    }
}
