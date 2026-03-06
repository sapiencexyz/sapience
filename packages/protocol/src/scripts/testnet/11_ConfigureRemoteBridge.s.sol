// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";
import {
    PredictionMarketTokenFactory
} from "../../PredictionMarketTokenFactory.sol";
import {
    IPredictionMarketBridgeBase
} from "../../bridge/interfaces/IPredictionMarketBridgeBase.sol";

/// @title Configure SM Network Bridge
/// @notice Configure bridge on SM Network with Ethereal settings
contract ConfigureRemoteBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("PM_NETWORK_LZ_EID"));
        // ACK fee for PM (Ethereal) to send ACK back to SM - paid in USDe
        // Ethereal uses USDe as native token, so this needs to be ~0.5 USDe
        uint128 ackFeeEstimate =
            uint128(vm.envOr("SM_ACK_FEE_ESTIMATE", uint256(0.5 ether)));

        PredictionMarketBridgeRemote bridge =
            PredictionMarketBridgeRemote(payable(bridgeAddr));
        PredictionMarketTokenFactory factory =
            PredictionMarketTokenFactory(factoryAddr);

        console.log("=== Configure SM Network Bridge ===");
        console.log("Bridge:", bridgeAddr);
        console.log("SM Network Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);
        console.log("Factory:", factoryAddr);
        console.log("ACK Fee Estimate:", ackFeeEstimate);

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        bridge.setBridgeConfig(
            IPredictionMarketBridgeBase.BridgeConfig({
                remoteEid: remoteEid,
                remoteBridge: remoteBridge,
                ackFeeEstimate: ackFeeEstimate
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
        console.log("Funded with 0.01 ETH for ACK fees");
        console.log("");
        console.log("Config complete:", bridge.isConfigComplete());
        console.log("Factory config complete:", factory.isConfigComplete());
    }
}
