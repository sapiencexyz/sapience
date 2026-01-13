// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title TestFeeQuoteScript
 * @notice DEPRECATED: This script is no longer valid.
 * @dev The resolver no longer has quoteResolution() function.
 *      Fee quoting is now done via ConditionalTokensReader.quoteResolution() on Polygon.
 */
contract TestFeeQuoteScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // Condition IDs from fork test (real Polymarket conditions)
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;

    function run() external view {
        revert("This script is deprecated. Fee quoting is now done via ConditionalTokensReader.quoteResolution() on Polygon.");
    }
}

