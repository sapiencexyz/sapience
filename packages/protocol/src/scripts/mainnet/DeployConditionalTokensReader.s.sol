// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ConditionalTokensReader
} from "../../resolvers/conditionalTokens/ConditionalTokensReader.sol";
import {
    IConditionalTokensReader
} from "../../resolvers/conditionalTokens/interfaces/IConditionalTokensReader.sol";

/// @title Deploy ConditionalTokensReader (Mainnet)
/// @notice Deploys ConditionalTokensReader on Polygon mainnet
/// @dev Reads Gnosis ConditionalTokens and sends resolution via LayerZero to Ethereal
contract DeployConditionalTokensReader is Script {
    function run() external {
        address deployer = vm.envAddress("POLYGON_DEPLOYER_ADDRESS");
        address lzEndpoint = vm.envAddress("POLYGON_LZ_ENDPOINT");
        address conditionalTokens =
            vm.envAddress("POLYGON_CONDITIONAL_TOKENS_ADDRESS");

        console.log("=== Deploy ConditionalTokensReader (Mainnet) ===");
        console.log("Owner:", deployer);
        console.log("LZ Endpoint:", lzEndpoint);
        console.log("ConditionalTokens:", conditionalTokens);

        vm.startBroadcast(vm.envUint("POLYGON_DEPLOYER_PRIVATE_KEY"));

        ConditionalTokensReader reader = new ConditionalTokensReader(
            lzEndpoint,
            deployer,
            IConditionalTokensReader.Settings({
                conditionalTokens: conditionalTokens
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("ConditionalTokensReader:", address(reader));
        console.log("");
        console.log("Add to .env:");
        console.log("CT_READER_ADDRESS=", address(reader));
        console.log("");
        console.log("Next: Run ConfigureCTBridge to wire Reader <-> Resolver.");
    }
}
