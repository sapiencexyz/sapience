// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title EncodeConfigs
 * @notice Helper script to encode LayerZero configs for use with cast commands
 * @dev Run this script to get the encoded configs, then use them in cast commands
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/encode_configs.s.sol
 */
contract EncodeConfigs is Script {
    function run() external pure {
        // Polygon SEND config values
        address executor = 0xCd3F213AD101472e1713C72B1697E727C803885b;
        uint32 maxMessageSize = 10000;
        uint64 confirmations = 20;
        uint8 requiredDvnCount = 2;
        address dvn1 = 0x23DE2FE932d9043291f870324B74F820e11dc81A;
        address dvn2 = 0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc;
        
        // Encode ExecutorConfig
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: maxMessageSize,
            executor: executor
        });
        bytes memory encodedExec = abi.encode(exec);
        
        // Encode UlnConfig
        address[] memory requiredDVNs = new address[](2);
        requiredDVNs[0] = dvn1;
        requiredDVNs[1] = dvn2;
        UlnConfig memory uln = UlnConfig({
            confirmations: confirmations,
            requiredDVNCount: requiredDvnCount,
            optionalDVNCount: type(uint8).max,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });
        bytes memory encodedUln = abi.encode(uln);
        
        console.log("=== Encoded Configs for Cast Commands ===");
        console.log("");
        console.log("ExecutorConfig (hex):");
        console.logBytes(encodedExec);
        console.log("");
        console.log("UlnConfig (hex):");
        console.logBytes(encodedUln);
        console.log("");
        console.log("=== Cast Commands ===");
        console.log("");
        console.log("# Step 1: Set send library");
        console.log("cast send 0x1a44076050125825900e736c501f859c50fE728c \\");
        console.log("  \"setSendLibrary(address,uint32,address)\" \\");
        console.log("  0x26DB702647e56B230E15687bFbC48b526E131dAe \\");
        console.log("  30110 \\");
        console.log("  0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3 \\");
        console.log("  --rpc-url $POLYGON_RPC --private-key $POLYGON_PRIVATE_KEY");
        console.log("");
        console.log("# Step 2: Set config (replace EXECUTOR_CONFIG and ULN_CONFIG with hex above)");
        console.log("cast send 0x1a44076050125825900e736c501f859c50fE728c \\");
        console.log("  \"setConfig(address,address,(uint32,uint32,bytes)[])\" \\");
        console.log("  0x26DB702647e56B230E15687bFbC48b526E131dAe \\");
        console.log("  0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3 \\");
        console.log("  \"[(30110,1,EXECUTOR_CONFIG),(30110,2,ULN_CONFIG)]\" \\");
        console.log("  --rpc-url $POLYGON_RPC --private-key $POLYGON_PRIVATE_KEY");
    }
}

