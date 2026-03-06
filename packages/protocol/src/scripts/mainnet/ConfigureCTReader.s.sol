// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ConditionalTokensReader
} from "../../resolvers/conditionalTokens/ConditionalTokensReader.sol";
import { LZTypes } from "../../resolvers/shared/LZTypes.sol";

/// @title Configure ConditionalTokensReader (Mainnet)
/// @notice Configure bridge on Polygon reader to send messages to Ethereal resolver
contract ConfigureCTReader is Script {
    function run() external {
        address readerAddr = vm.envAddress("CT_READER_ADDRESS");
        address resolverAddr = vm.envAddress("CT_CONDITION_RESOLVER_ADDRESS");
        uint32 etherealEid = uint32(vm.envUint("PM_NETWORK_LZ_EID"));

        ConditionalTokensReader reader =
            ConditionalTokensReader(payable(readerAddr));

        console.log("=== Configure CT Reader (Polygon) ===");
        console.log("Reader:", readerAddr);
        console.log("Resolver (Ethereal):", resolverAddr);
        console.log("Ethereal LZ EID:", etherealEid);

        vm.startBroadcast(vm.envUint("POLYGON_DEPLOYER_PRIVATE_KEY"));

        // Set bridge config
        reader.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: etherealEid, remoteBridge: resolverAddr
            })
        );

        // Set LZ peer
        bytes32 peer = bytes32(uint256(uint160(resolverAddr)));
        reader.setPeer(etherealEid, peer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Bridge config set");
        console.log("LZ peer set");
    }
}
