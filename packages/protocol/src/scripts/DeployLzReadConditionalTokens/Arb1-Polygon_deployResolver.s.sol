// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title DeployLzReadConditionalTokensResolver
 * @notice Deploy PredictionMarketLZConditionalTokensResolver on Arbitrum One
 *         configured to query Polygon ConditionalTokens via lzRead
 * @dev Run with:
 *      forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_deployResolver.s.sol \
 *        --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY
 */
contract DeployLzReadConditionalTokensResolver is Script {
    // Hardcoded values - Arbitrum One deployment configuration
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant OWNER = 0xdb5Af497A73620d881561eDb508012A5f84e9BA2; // From existing deployment
    address constant POLYGON_CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045; // Polygon ConditionalTokens
    uint32 constant POLYGON_EID = 30109; // Polygon
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    uint256 constant MAX_PREDICTION_MARKETS = 10;
    uint16 constant CONFIRMATIONS = 15;
    uint128 constant LZ_READ_GAS = 200_000;
    uint32 constant LZ_READ_RESULT_SIZE = 32;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address endpoint = ARB_LZ_ENDPOINT;
        address owner = OWNER;
        uint32 readChannelEid = READ_CHANNEL_EID;
        uint32 polygonEid = POLYGON_EID;
        address polygonCtf = POLYGON_CTF;
        uint256 maxMarkets = MAX_PREDICTION_MARKETS;
        uint16 confirmations = CONFIRMATIONS;
        uint128 lzReadGas = LZ_READ_GAS;
        uint32 lzReadResultSize = LZ_READ_RESULT_SIZE;

        console.log("=== Deploying PredictionMarketLZConditionalTokensResolver ===");
        console.log("Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Read Channel EID:", readChannelEid);
        console.log("Target EID (Polygon):", polygonEid);
        console.log("ConditionalTokens:", polygonCtf);
        console.log("Max Prediction Markets:", maxMarkets);
        console.log("Confirmations:", confirmations);
        console.log("LZ Read Gas:", lzReadGas);
        console.log("LZ Read Result Size:", lzReadResultSize);

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        PredictionMarketLZConditionalTokensResolver resolver = new PredictionMarketLZConditionalTokensResolver(
            endpoint,
            owner,
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: maxMarkets
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PredictionMarketLZConditionalTokensResolver deployed to:", address(resolver));
        console.log("");
        console.log("Next step: Set RESOLVER env var and run the request script:");
        console.log("  export RESOLVER=", address(resolver));
    }
}

