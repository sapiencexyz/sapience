// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolverUmaSide} from "../../predictionMarket/resolvers/PredictionMarketLZResolverUmaSide.sol";

// UMA side is on Arbitrum One
// Deploy this UMA-side resolver on Arbitrum One (sends LZ messages to PM side)
contract DeployPredictionMarketLZResolverUmaSide is Script {
    function run() external {
        // Load from environment (.env/.env.local)
        address endpoint = vm.envAddress("ARB_LZ_ENDPOINT");
        address owner = vm.envAddress("ARB_OWNER");
        address optimisticOracleV3 = vm.envAddress("UMA_OOV3");

        address bondCurrency = vm.envAddress("UMA_BOND_TOKEN");
        uint256 bondAmount = vm.envUint("UMA_BOND_AMOUNT");
        uint64 assertionLiveness = uint64(vm.envOr("UMA_ASSERTION_LIVENESS", uint256(3600)));

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));
        PredictionMarketLZResolverUmaSide resolver = new PredictionMarketLZResolverUmaSide(
            endpoint,
            owner,
            optimisticOracleV3,
            PredictionMarketLZResolverUmaSide.Settings({
                bondCurrency: bondCurrency,
                bondAmount: bondAmount,
                assertionLiveness: assertionLiveness
            })
        );
        vm.stopBroadcast();

        console.log("PredictionMarketLZResolverUmaSide deployed to:", address(resolver));
    }
}



