// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PositionTokenBridgeRemote
} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {
    PositionTokenFactory
} from "../../../v2/bridge/PositionTokenFactory.sol";
import {
    IPositionTokenBridgeBase
} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Configure SM Network Bridge (Mainnet)
/// @notice Configure bridge on SM Network (Arbitrum mainnet) with Ethereal settings
contract ConfigureRemoteBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("PM_NETWORK_LZ_EID"));

        PositionTokenBridgeRemote bridge =
            PositionTokenBridgeRemote(payable(bridgeAddr));
        PositionTokenFactory factory = PositionTokenFactory(factoryAddr);

        console.log("=== Configure SM Network Bridge (Mainnet) ===");
        console.log("Bridge:", bridgeAddr);
        console.log("PM Network Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);
        console.log("Factory:", factoryAddr);

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        bridge.setBridgeConfig(
            IPositionTokenBridgeBase.BridgeConfig({
                remoteEid: remoteEid, remoteBridge: remoteBridge
            })
        );

        // Set LZ peer
        bytes32 peer = bytes32(uint256(uint160(remoteBridge)));
        bridge.setPeer(remoteEid, peer);

        // Set factory deployer to bridge
        factory.setDeployer(bridgeAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Bridge config set");
        console.log("LZ peer set");
        console.log("Factory deployer set to bridge");
        console.log("");
        console.log("Config complete:", bridge.isConfigComplete());
        console.log("Factory config complete:", factory.isConfigComplete());
    }
}
