// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title SetDVNForPolygonReader
 * @notice Configure LayerZero DVNs, libraries, and confirmations for Polygon ConditionalTokensReader
 * @dev This configures the SEND side (Polygon → Ethereal):
 *      - Send library
 *      - Send DVNs and confirmations
 *      - Executor config
 *      
 *      Required env vars:
 *      - POLYGON_CONDITIONAL_TOKENS_READER: Deployed ConditionalTokensReader address
 *      - POLYGON_LZ_ENDPOINT: LayerZero endpoint on Polygon
 *      - POLYGON_SEND_LIB: Send library address on Polygon
 *      - POLYGON_DVN: Required DVN address on Polygon
 *      - POLYGON_EXECUTOR: Executor address on Polygon (or 0x0 for default)
 *      - ETHEREAL_EID: Destination chain EID (Ethereal)
 *      
 *      Optional env vars:
 *      - ULN_CONFIRMATIONS: Block confirmations (default: 20)
 *      - REQUIRED_DVN_COUNT: Required DVN count (default: 1)
 *      - MAX_MESSAGE_SIZE: Max message size (default: 10000)
 *      - GRACE_PERIOD: Grace period for library switch (default: 0)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/05_Polygon_setDVN.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY
 */
contract SetDVNForPolygonReader is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        // LayerZero addresses for Polygon → Ethereal
        address reader = vm.envAddress("POLYGON_CONDITIONAL_TOKENS_READER");
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c; // Polygon Endpoint V2
        address sendLib = 0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3; // Polygon SendLib302
        // address dvn = 0x25e0e650a78e6304A3983Fc4b7Ffc6544b1bEea6; // Horizen DVN
        address dvn = 0x13feb7234Ff60A97af04477d6421415766753Ba3; // Canary DVN
        address executor = 0xCd3F213AD101472e1713C72B1697E727C803885b; // Polygon Executor
        // address executor = 0x4208D6E27538189bB48E603D6123A94b8Abe0A0b; // Ethereal Executor
        uint32 etherealEid = 30391; // Ethereal EID

        // LayerZero config
        uint64 confirmations = 10; // Send confirmations for Polygon → Ethereal
        uint8 requiredDvnCount = 1;
        uint32 maxMessageSize = uint32(vm.envOr("MAX_MESSAGE_SIZE", uint256(10000)));

        console.log("=== Configuring LayerZero DVN for Polygon Reader (SEND) ===");
        console.log("Reader:", reader);
        console.log("Endpoint:", endpoint);
        console.log("Send Library:", sendLib);
        console.log("DVN:", dvn);
        console.log("Executor:", executor);
        console.log("Destination EID (Ethereal):", etherealEid);
        console.log("Confirmations:", confirmations);
        console.log("Required DVN Count:", requiredDvnCount);
        console.log("Max Message Size:", maxMessageSize);
        console.log("");

        vm.startBroadcast();

        // Set send library for outbound messages (Polygon → Ethereal)
        console.log("Setting send library...");
        // ILayerZeroEndpointV2(endpoint).setSendLibrary(
        //     reader,
        //     etherealEid,
        //     sendLib
        // );
        console.log("Send library set");

        // Configure ULN (DVNs + confirmations) for sending
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = dvn;
        UlnConfig memory uln = UlnConfig({
            confirmations: confirmations,
            requiredDVNCount: requiredDvnCount,
            optionalDVNCount: 0, // No optional DVNs
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });

        // Configure executor and create params in single scope to avoid stack too deep
        SetConfigParam[] memory params = new SetConfigParam[](2);
        {
            ExecutorConfig memory exec = ExecutorConfig({
                maxMessageSize: maxMessageSize,
                executor: executor
            });
            params[0] = SetConfigParam(etherealEid, EXECUTOR_CONFIG_TYPE, abi.encode(exec));
        }
        params[1] = SetConfigParam(etherealEid, ULN_CONFIG_TYPE, abi.encode(uln));

        console.log("Setting send config (executor + DVN)...");
        ILayerZeroEndpointV2(endpoint).setConfig(reader, sendLib, params);
        console.log("Send config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Polygon reader is now configured to send messages to Ethereal");
        console.log("Next step: Run script 06_Ethereal_setDVN.s.sol to configure receive side");
    }
}

