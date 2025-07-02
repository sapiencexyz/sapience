// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {UMALayerZeroBridge} from "../bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";

contract ConfigureUMALZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address owner = 0xdb5Af497A73620d881561eDb508012A5f84e9BA2;
        address marketLZBridge = 0xee6832F73862ABac4CC87bE58B4A949edd8533F7;
        address umaLZBridge = 0xCe6876D1362585dF3F98294e7F214ad819AE9fA7;
        address optimisticOracleV3 = 0xa6147867264374F324524E30C02C331cF28aa879; // UMA Optimistic Oracle V3 at Arbitrum One

        (uint32 eidMarket, bytes32 peerMarket) = (
            uint32(30184),
            bytes32(uint256(uint160(marketLZBridge)))
        );
        (uint32 eidUMA, bytes32 peerUMA) = (
            uint32(30110),
            bytes32(uint256(uint160(umaLZBridge)))
        );

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        UMALayerZeroBridge uma = UMALayerZeroBridge(payable(umaLZBridge));
        uma.setPeer(eidMarket, peerMarket);

        uma.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: eidMarket,
                remoteBridge: address(marketLZBridge)
            })
        );
        uma.setOptimisticOracleV3(optimisticOracleV3);
        uma.setLzReceiveCost(1000000);
        uma.setGasThresholds(0.01 ether, 0.005 ether);
        vm.stopBroadcast();
    }
}
