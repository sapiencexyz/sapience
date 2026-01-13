// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title RequestResolutionScript
 * @notice DEPRECATED: This script is no longer valid.
 * @dev The resolver no longer has requestResolution() function.
 *      Resolution requests are now made to ConditionalTokensReader contract on Polygon.
 *      This script is kept for reference but will not compile.
 */
contract RequestResolutionScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // Condition IDs from fork test (real Polymarket conditions)
    // Condition that resolved to YES: payoutNumerators = [0, 1]
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
    // Condition that resolved to NO: payoutNumerators = [1, 0]
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One

    function run() external {
        revert("This script is deprecated. Resolution requests are now made to ConditionalTokensReader.requestResolution() on Polygon.");
    }
}

