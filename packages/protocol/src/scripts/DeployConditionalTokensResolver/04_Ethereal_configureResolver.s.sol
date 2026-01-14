// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/**
 * @title ConfigureEtherealResolver
 * @notice Configure Ethereal resolver with receive library, bridge config and peer
 * @dev Sets up LayerZero communication - Ethereal resolver receives from Polygon reader
 *      Order: setReceiveLibrary -> setBridgeConfig -> setPeer
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

        // LayerZero infrastructure addresses on Ethereal
        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address receiveLib = 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043; // Ethereal ReceiveLib302
        uint32 gracePeriod = 0;

        console.log("=== Configuring Ethereal ConditionalTokensResolver ===");
        console.log("Polygon Reader:", polygonReader);
        console.log("Ethereal Resolver:", etherealResolver);
        console.log("Polygon EID:", polygonEid);
        console.log("Endpoint:", endpoint);
        console.log("Receive Library:", receiveLib);

        PredictionMarketLZConditionalTokensResolver resolverContract =
            PredictionMarketLZConditionalTokensResolver(payable(etherealResolver));

        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        // Step 1: Set receive library (must be done before setPeer)
        console.log("Setting receive library...");
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(etherealResolver, polygonEid, receiveLib, gracePeriod);
        console.log("Receive library set");

        // Step 2: Set bridge config
        resolverContract.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: polygonEid,
            remoteBridge: polygonReader
        }));
        console.log("Bridge config set on Ethereal resolver");

        // Step 3: Set peer (requires receive library to be set first)
        resolverContract.setPeer(polygonEid, bytes32(uint256(uint160(polygonReader))));
        console.log("Peer set on Ethereal resolver for Polygon");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Next step: Run script 05_Polygon_setDVN.s.sol to configure LayerZero DVNs");
    }
}

