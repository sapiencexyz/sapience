// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title DebugQuoteScript
 * @notice Deep diagnostic script to understand the quote error
 */
contract DebugQuoteScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;

    function run() external view {
        // All values are hardcoded - no env vars needed (read-only script)
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        
        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));
        
        console.log("=== Debugging Quote Error ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        
        // Check resolver config
        uint256 maxMarkets = resolver.config();
        console.log("");
        console.log("Resolver Config:");
        console.log("  maxPredictionMarkets:", maxMarkets);
        
        // Check bridge config
        BridgeTypes.BridgeConfig memory bridgeConfig = resolver.getBridgeConfig();
        console.log("  remoteEid:", bridgeConfig.remoteEid);
        console.log("  remoteBridge:", vm.toString(bridgeConfig.remoteBridge));
        
        // Note: quoteResolution function was removed - resolution is now requested from ConditionalTokensReader
        console.log("");
        console.log("Note: quoteResolution function was removed.");
        console.log("Resolution requests are now made to ConditionalTokensReader contract.");
    }
}

