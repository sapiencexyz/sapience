// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {PositionTokenFactory} from "../../../v2/bridge/PositionTokenFactory.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Configure Remote Bridge
/// @notice Set bridge config, LayerZero peer, and factory deployer on Arbitrum
contract ConfigureRemoteBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ARB_BRIDGE_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address remoteBridge = vm.envAddress("ETHEREAL_BRIDGE_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("ETHEREAL_EID"));

        PositionTokenBridgeRemote bridge = PositionTokenBridgeRemote(payable(bridgeAddr));
        PositionTokenFactory factory = PositionTokenFactory(factoryAddr);

        console.log("Configuring Remote Bridge on Arbitrum...");
        console.log("Bridge:", bridgeAddr);
        console.log("Factory:", factoryAddr);
        console.log("Remote Bridge (Ethereal):", remoteBridge);
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

        // Set factory deployer to bridge
        factory.setDeployer(bridgeAddr);
        console.log("Factory deployer set to bridge");

        vm.stopBroadcast();

        // Verify config
        bool bridgeComplete = bridge.isConfigComplete();
        bool factoryComplete = factory.isConfigComplete();
        console.log("Bridge config complete:", bridgeComplete);
        console.log("Factory config complete:", factoryComplete);
    }
}
