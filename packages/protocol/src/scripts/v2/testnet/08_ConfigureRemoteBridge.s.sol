// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {PositionTokenFactory} from "../../../v2/bridge/PositionTokenFactory.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Configure Remote Bridge
/// @notice Configure bridge on Arbitrum with Ethereal settings
contract ConfigureRemoteBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ARB_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("ETHEREAL_BRIDGE_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("ETHEREAL_LZ_EID"));

        PositionTokenBridgeRemote bridge = PositionTokenBridgeRemote(payable(bridgeAddr));
        PositionTokenFactory factory = PositionTokenFactory(factoryAddr);

        console.log("=== Configure Remote Bridge ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Remote Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);
        console.log("Factory:", factoryAddr);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        bridge.setBridgeConfig(
            IPositionTokenBridgeBase.BridgeConfig({
                remoteEid: remoteEid,
                remoteBridge: remoteBridge
            })
        );

        // Set LZ peer
        bytes32 peer = bytes32(uint256(uint160(remoteBridge)));
        bridge.setPeer(remoteEid, peer);

        // Set factory deployer to bridge
        factory.setDeployer(bridgeAddr);

        // Fund bridge for ACK fees
        (bool success,) = bridgeAddr.call{value: 0.01 ether}("");
        require(success, "Failed to fund bridge");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Bridge config set");
        console.log("LZ peer set");
        console.log("Factory deployer set to bridge");
        console.log("Funded with 0.01 ETH for ACK fees");
        console.log("");
        console.log("Config complete:", bridge.isConfigComplete());
        console.log("Factory config complete:", factory.isConfigComplete());
    }
}
