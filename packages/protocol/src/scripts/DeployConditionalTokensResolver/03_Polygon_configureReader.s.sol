// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ConditionalTokensReader} from "../../predictionMarket/resolvers/ConditionalTokensReader.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigurePolygonReader
 * @notice Configure Polygon ConditionalTokensReader with bridge config and peer
 * @dev Sets up LayerZero communication - Polygon reader sends to Ethereal resolver
 *      
 *      Required env vars:
 *      - POLYGON_CONDITIONAL_TOKENS_READER: Deployed ConditionalTokensReader address on Polygon
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Deployed Resolver address on Ethereal
 *      - ETHEREAL_EID: LayerZero endpoint ID for Ethereal (e.g., 30391)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/03_Polygon_configureReader.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY
 */
contract ConfigurePolygonReader is Script {
    function run() external {
        address polygonReader = vm.envAddress("POLYGON_CONDITIONAL_TOKENS_READER");
        address etherealResolver = vm.envAddress("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER");
        uint32 etherealEid = uint32(vm.envUint("ETHEREAL_EID"));

        console.log("=== Configuring Polygon ConditionalTokensReader ===");
        console.log("Polygon Reader:", polygonReader);
        console.log("Ethereal Resolver:", etherealResolver);
        console.log("Ethereal EID:", etherealEid);
        ConditionalTokensReader readerContract = ConditionalTokensReader(payable(polygonReader));
        
        vm.startBroadcast(vm.envUint("POLYGON_PRIVATE_KEY"));

        // Set bridge config: remote is Ethereal resolver
        readerContract.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: etherealEid,
            remoteBridge: etherealResolver
        }));
        console.log("Bridge config set on Polygon reader");

        // Set peer: Ethereal resolver is the peer
        readerContract.setPeer(etherealEid, bytes32(uint256(uint160(etherealResolver))));
        console.log("Peer set on Polygon reader for Ethereal");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Next step: Run script 04_Ethereal_configureResolver.s.sol");
        console.log("Then: Run script 05_Polygon_setDVN.s.sol");
    }
}

