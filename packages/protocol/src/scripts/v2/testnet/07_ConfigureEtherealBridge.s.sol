// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Configure Ethereal Bridge
/// @notice Configure bridge on Ethereal with remote settings
contract ConfigureEtherealBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ETHEREAL_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("ARB_BRIDGE_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("ARB_LZ_EID"));

        PositionTokenBridge bridge = PositionTokenBridge(payable(bridgeAddr));

        console.log("=== Configure Ethereal Bridge ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Remote Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        bridge.setBridgeConfig(
            IPositionTokenBridgeBase.BridgeConfig({remoteEid: remoteEid, remoteBridge: remoteBridge})
        );

        // Set LZ peer
        bytes32 peer = bytes32(uint256(uint160(remoteBridge)));
        bridge.setPeer(remoteEid, peer);

        // Fund bridge for ACK fees
        (bool success,) = bridgeAddr.call{value: 0.01 ether}("");
        require(success, "Failed to fund bridge");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Bridge config set");
        console.log("LZ peer set");
        console.log("Funded with 0.01 ETH for ACK fees");
        console.log("");
        console.log("Config complete:", bridge.isConfigComplete());
    }
}
