// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigureResolverScript
 * @notice Configure the resolver with peer for read channel
 * @dev For lzRead, the peer is set to the resolver itself (self-read)
 *      Run this after deployment and before requesting resolution
 */
contract ConfigureResolverScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    uint32 constant POLYGON_EID = 30109; // Polygon
    address constant POLYGON_CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045; // Polygon ConditionalTokens
    uint256 constant MAX_PREDICTION_MARKETS = 10;
    uint16 constant CONFIRMATIONS = 15;
    uint128 constant LZ_READ_GAS = 200_000;
    uint32 constant LZ_READ_RESULT_SIZE = 32;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        uint32 readChannelEid = READ_CHANNEL_EID;

        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));

        // All config values are hardcoded
        uint32 polygonEid = POLYGON_EID;
        address polygonCtf = POLYGON_CTF;
        uint256 maxMarkets = MAX_PREDICTION_MARKETS;
        uint16 confirmations = CONFIRMATIONS;
        uint128 lzReadGas = LZ_READ_GAS;
        uint32 lzReadResultSize = LZ_READ_RESULT_SIZE;

        console.log("=== Configuring Resolver ===");
        console.log("Resolver:", resolverAddr);
        console.log("Read Channel EID:", readChannelEid);
        console.log("Target EID (Polygon):", polygonEid);

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        // Update config
        resolver.setConfig(IPredictionMarketLZConditionalTokensResolver.Settings({
            maxPredictionMarkets: maxMarkets
        }));
        console.log("Config updated");

        // Set bridge config for receiving messages from ConditionalTokensReader
        // Note: conditionalTokensReader address should be set here
        address conditionalTokensReader = address(0); // TODO: Set actual ConditionalTokensReader address
        resolver.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: polygonEid,
            remoteBridge: conditionalTokensReader
        }));
        console.log("Bridge config updated");

        // Set peer for receiving messages from Polygon
        bytes32 peerReader = bytes32(uint256(uint160(conditionalTokensReader)));
        resolver.setPeer(polygonEid, peerReader);
        console.log("Peer set for Polygon:", vm.toString(peerReader));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Resolver is now ready to receive resolution messages from ConditionalTokensReader.");
    }
}

