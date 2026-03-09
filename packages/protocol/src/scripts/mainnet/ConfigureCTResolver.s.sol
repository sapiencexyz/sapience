// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ConditionalTokensConditionResolver
} from "../../resolvers/conditionalTokens/ConditionalTokensConditionResolver.sol";
import { LZTypes } from "../../resolvers/shared/LZTypes.sol";

/// @title Configure ConditionalTokensConditionResolver (Mainnet)
/// @notice Configure bridge on Ethereal resolver to accept messages from Polygon reader
contract ConfigureCTResolver is Script {
    function run() external {
        address resolverAddr = vm.envAddress("CT_CONDITION_RESOLVER_ADDRESS");
        address readerAddr = vm.envAddress("CT_READER_ADDRESS");
        uint32 polygonEid = uint32(vm.envUint("POLYGON_LZ_EID"));

        ConditionalTokensConditionResolver resolver =
            ConditionalTokensConditionResolver(resolverAddr);

        console.log("=== Configure CT Resolver (Ethereal) ===");
        console.log("Resolver:", resolverAddr);
        console.log("Reader (Polygon):", readerAddr);
        console.log("Polygon LZ EID:", polygonEid);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        resolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: polygonEid, remoteBridge: readerAddr
            })
        );

        // Set LZ peer
        bytes32 peer = bytes32(uint256(uint160(readerAddr)));
        resolver.setPeer(polygonEid, peer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Bridge config set");
        console.log("LZ peer set");
    }
}
