// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PositionTokenBridge
} from "../../../v2/bridge/PositionTokenBridge.sol";
import {
    IPredictionMarketBridgeBase
} from "../../../v2/bridge/interfaces/IPredictionMarketBridgeBase.sol";

/// @title Configure PM Network Bridge
/// @notice Configure bridge on PM Network with remote settings
contract ConfigureEtherealBridge is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address remoteBridge = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        uint32 remoteEid = uint32(vm.envUint("SM_NETWORK_LZ_EID"));
        uint128 ackFeeEstimate =
            uint128(vm.envOr("ACK_FEE_ESTIMATE", uint256(0.0001 ether)));

        PositionTokenBridge bridge = PositionTokenBridge(payable(bridgeAddr));

        console.log("=== Configure PM Network Bridge ===");
        console.log("Bridge:", bridgeAddr);
        console.log("SM Network Bridge:", remoteBridge);
        console.log("Remote EID:", remoteEid);
        console.log("ACK Fee Estimate:", ackFeeEstimate);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

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

        // Fund bridge for ACK fees
        (bool success,) = bridgeAddr.call{ value: 0.01 ether }("");
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
