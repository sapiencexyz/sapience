// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";

/// @title Deploy PositionTokenBridgeRemote
/// @notice Deploy bridge on Arbitrum Sepolia (remote chain)
contract DeployRemoteBridge is Script {
    function run() external {
        address endpoint = vm.envAddress("ARB_LZ_ENDPOINT");
        address owner = vm.envAddress("DEPLOYER_ADDRESS");
        address factory = vm.envAddress("FACTORY_ADDRESS");

        console.log("Deploying PositionTokenBridgeRemote on Arbitrum...");
        console.log("LZ Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Factory:", factory);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        PositionTokenBridgeRemote bridge = new PositionTokenBridgeRemote(
            endpoint,
            owner,
            factory
        );

        vm.stopBroadcast();

        console.log("PositionTokenBridgeRemote deployed at:", address(bridge));
        console.log("");
        console.log("Add to .env:");
        console.log("ARB_BRIDGE_ADDRESS=%s", address(bridge));
    }
}
