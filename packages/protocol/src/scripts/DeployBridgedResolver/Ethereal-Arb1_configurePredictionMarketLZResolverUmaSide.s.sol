// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolverUmaSide} from "../../predictionMarket/resolvers/PredictionMarketLZResolverUmaSide.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

// Configure the UMA-side resolver on Arbitrum to point to PM-side peer and UMA settings
contract ConfigurePredictionMarketLZResolverUmaSide is Script {
    function run() external {
        // Read from environment:
        //   UMA_SIDE_RESOLVER - Deployed UMA-side resolver (Arbitrum)
        //   PM_LZ_RESOLVER    - Deployed PM-side resolver (Ethereal)
        //   PM_SIDE_EID       - Ethereal eid
        // Optional UMA params:
        //   UMA_OOV3, UMA_BOND_TOKEN, UMA_BOND_AMOUNT, UMA_ASSERTION_LIVENESS, UMA_ASSERTER
        address umaSideResolver = vm.envAddress("UMA_SIDE_RESOLVER");
        address pmLzResolver = vm.envAddress("PM_LZ_RESOLVER");
        uint32 pmSideEid = uint32(vm.envUint("PM_SIDE_EID"));

        address optimisticOracleV3 = vm.envOr("UMA_OOV3", address(0));
        address bondCurrency = vm.envOr("UMA_BOND_TOKEN", address(0));
        uint256 bondAmount = vm.envOr("UMA_BOND_AMOUNT", uint256(0));
        uint64 assertionLiveness = uint64(vm.envOr("UMA_ASSERTION_LIVENESS", uint256(3600)));
        address asserter = vm.envOr("UMA_ASSERTER", address(0));

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));
        PredictionMarketLZResolverUmaSide resolver = PredictionMarketLZResolverUmaSide(payable(umaSideResolver));

        // eid of other network 
        (uint32 peerEid, bytes32 peerResolver) = (uint32(pmSideEid), bytes32(uint256(uint160(pmLzResolver))));
        resolver.setPeer(peerEid, peerResolver);

        resolver.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: pmSideEid,
                remoteBridge: pmLzResolver
            })
        );

        // Optional tuning via env
        resolver.setLzReceiveCost(uint128(vm.envUint("UMA_LZ_RECEIVE_COST")));
        // resolver.setGasThresholds(vm.envUint("UMA_GAS_WARN"), vm.envUint("UMA_GAS_CRIT"));

        // Optional: allow a specific asserter
        if (asserter != address(0)) {
            resolver.approveAsserter(asserter);
        }

        vm.stopBroadcast();
    }
}



