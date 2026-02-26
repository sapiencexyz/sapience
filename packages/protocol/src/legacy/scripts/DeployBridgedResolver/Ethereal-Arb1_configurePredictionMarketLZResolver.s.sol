// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolver} from "../../predictionMarket/resolvers/PredictionMarketLZResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

// Configure the PM-side LZ resolver on Ethereal to trust UMA-side peer and set gas params
contract ConfigurePredictionMarketLZResolver is Script {
    function run() external {
        // Read from environment:
        //   PM_LZ_RESOLVER   - Deployed PredictionMarketLZResolver on Ethereal
        //   UMA_SIDE_RESOLVER - Deployed PredictionMarketLZResolverUmaSide on Arbitrum
        //   UMA_SIDE_EID     - Arbitrum One eid (e.g., 30110)
        address pmLzResolver = vm.envAddress("PM_LZ_RESOLVER");
        address umaSideResolver = vm.envAddress("UMA_SIDE_RESOLVER");
        uint32 umaSideEid = uint32(vm.envUint("UMA_SIDE_EID"));

        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));
        PredictionMarketLZResolver resolver = PredictionMarketLZResolver(payable(pmLzResolver));

        // eid of other network 
        (uint32 peerEid, bytes32 peerResolver) = (uint32(umaSideEid), bytes32(uint256(uint160(umaSideResolver))));
        resolver.setPeer(peerEid, peerResolver);
        
        resolver.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: umaSideEid,
                remoteBridge: umaSideResolver
            })
        );

        vm.stopBroadcast();
    }
}


