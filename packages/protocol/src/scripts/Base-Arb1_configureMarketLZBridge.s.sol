// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {MarketLayerZeroBridge} from "../bridge/MarketLayerZeroBridge.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";

contract ConfigureMarketLZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address marketLZBridge = 0xee6832F73862ABac4CC87bE58B4A949edd8533F7;
        address umaLZBridge = 0xCe6876D1362585dF3F98294e7F214ad819AE9fA7;

        (uint32 eidUMA, bytes32 peerUMA) = (uint32(30110), bytes32(uint256(uint160(umaLZBridge))));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        MarketLayerZeroBridge market = MarketLayerZeroBridge(payable(marketLZBridge));
        market.setPeer(eidUMA, peerUMA);

        market.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: eidUMA, remoteBridge: address(umaLZBridge)}));
        market.setLzReceiveCost(1000000);
        market.setGasThresholds(0.01 ether, 0.005 ether);
        vm.stopBroadcast();
    }
}
