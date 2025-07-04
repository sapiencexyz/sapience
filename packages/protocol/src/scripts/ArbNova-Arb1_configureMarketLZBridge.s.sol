// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {MarketLayerZeroBridge} from "../bridge/MarketLayerZeroBridge.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";

contract ConfigureMarketLZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address marketLZBridge = 0x26DB702647e56B230E15687bFbC48b526E131dAe;
        address umaLZBridge = 0xcfEfE80B7784e9009D07a8bF4840E8E5BE106bDC;

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
