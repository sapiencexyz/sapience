// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {UMALayerZeroBridge} from "../bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";

// Deploy this contract on Base (where UMA is deployed)
contract ConfigureUMALZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address marketLZBridge = 0xCf17b4834223D7e54B92f8e43229C1E82faF7226;
        address umaLZBridge = 0x5234634f1089C5AF95662E88FeB8a5E0Fc647ed4;
        address optimisticOracleV3 = 0x2aBf1Bd76655de80eDB3086114315Eec75AF500c; // UMA Optimistic Oracle V3 at Base

        // eid of other network. In this case is Arbitrum One's 
        (uint32 eidMarket, bytes32 peerMarket) = (uint32(30110), bytes32(uint256(uint160(marketLZBridge))));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        UMALayerZeroBridge uma = UMALayerZeroBridge(payable(umaLZBridge));
        uma.setPeer(eidMarket, peerMarket);

        uma.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: eidMarket, remoteBridge: address(marketLZBridge)}));
        uma.setOptimisticOracleV3(optimisticOracleV3);
        uma.setLzReceiveCost(1000000);
        uma.setGasThresholds(0.01 ether, 0.005 ether);
        vm.stopBroadcast();
    }
}
