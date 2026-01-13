// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigureEtherealResolver
 * @notice Configure Ethereal resolver with bridge config and peer
 * @dev Sets up LayerZero communication - Ethereal resolver receives from Polygon reader
 *      
 *      Required env vars:
 *      - POLYGON_CONDITIONAL_TOKENS_READER: ConditionalTokensReader address on Polygon
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Resolver address on Ethereal
 *      - POLYGON_EID: LayerZero endpoint ID for Polygon (e.g., 30109)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/04_Ethereal_configureResolver.s.sol \
 *        --rpc-url $ETHEREAL_RPC --broadcast --private-key $ETHEREAL_PRIVATE_KEY
 */
contract ConfigureEtherealResolver is Script {
    function run() external {
        address polygonReader = vm.envAddress("POLYGON_CONDITIONAL_TOKENS_READER");
        address etherealResolver = vm.envAddress("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER");
        uint32 polygonEid = uint32(vm.envUint("POLYGON_EID"));

        console.log("=== Configuring Ethereal ConditionalTokensResolver ===");
        console.log("Polygon Reader:", polygonReader);
        console.log("Ethereal Resolver:", etherealResolver);
        console.log("Polygon EID:", polygonEid);

        PredictionMarketLZConditionalTokensResolver resolverContract = 
            PredictionMarketLZConditionalTokensResolver(payable(etherealResolver));
        
        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        // Set bridge config: remote is Polygon reader
        resolverContract.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: polygonEid,
            remoteBridge: polygonReader
        }));
        console.log("Bridge config set on Ethereal resolver");

        // Set peer: Polygon reader is the peer
        resolverContract.setPeer(polygonEid, bytes32(uint256(uint160(polygonReader))));
        console.log("Peer set on Ethereal resolver for Polygon");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Next step: Run script 05_Polygon_setDVN.s.sol to configure LayerZero DVNs");
    }
}

