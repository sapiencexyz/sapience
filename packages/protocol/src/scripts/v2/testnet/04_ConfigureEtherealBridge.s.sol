// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Configure Ethereal Bridge
/// @notice Set bridge config and LayerZero peer on Ethereal
contract ConfigureEtherealBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ETHEREAL_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("ARB_BRIDGE_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("ARB_SEPOLIA_EID"));

        PositionTokenBridge bridge = PositionTokenBridge(payable(bridgeAddr));

        console.log("Configuring Ethereal Bridge...");
        console.log("Bridge:", bridgeAddr);
        console.log("Remote Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        bridge.setBridgeConfig(
            IPositionTokenBridgeBase.BridgeConfig({
                remoteEid: remoteEid,
                remoteBridge: remoteBridge
            })
        );
        console.log("Bridge config set");

        // Set LayerZero peer
        bytes32 peerBytes = bytes32(uint256(uint160(remoteBridge)));
        bridge.setPeer(remoteEid, peerBytes);
        console.log("LZ peer set");

        vm.stopBroadcast();

        // Verify config
        bool isComplete = bridge.isConfigComplete();
        console.log("Config complete:", isComplete);
    }
}
