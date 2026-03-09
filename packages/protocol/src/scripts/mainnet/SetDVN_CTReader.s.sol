// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {
    UlnConfig
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {
    ExecutorConfig
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/// @title Set DVN Configuration for ConditionalTokensReader (Polygon)
/// @notice Configures SendLib, DVN, and Executor for the CT Reader on Polygon.
///         The reader is an OAppSender only — it sends resolution data to Ethereal.
///
/// Env vars:
///   CT_READER_ADDRESS              - ConditionalTokensReader on Polygon
///   POLYGON_LZ_ENDPOINT            - LayerZero endpoint on Polygon
///   PM_NETWORK_LZ_EID              - Ethereal LayerZero endpoint ID (destination)
///   POLYGON_SEND_LIB               - Polygon send library address
///   POLYGON_DVN_1, POLYGON_DVN_2   - DVN addresses on Polygon
///   POLYGON_EXECUTOR               - Executor address on Polygon
///   POLYGON_DEPLOYER_PRIVATE_KEY   - Deployer (owner) private key
contract SetDVN_CTReader is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        address reader = vm.envAddress("CT_READER_ADDRESS");
        address endpoint = vm.envAddress("POLYGON_LZ_ENDPOINT");
        uint32 remoteEid = uint32(vm.envUint("PM_NETWORK_LZ_EID"));

        address sendLib = vm.envAddress("POLYGON_SEND_LIB");
        address dvn1 = vm.envAddress("POLYGON_DVN_1");
        address dvn2 = vm.envAddress("POLYGON_DVN_2");
        address executor = vm.envAddress("POLYGON_EXECUTOR");

        console.log("=== Set DVN for CT Reader (Polygon) ===");
        console.log("Reader:", reader);
        console.log("Endpoint:", endpoint);
        console.log("Remote EID (Ethereal):", remoteEid);
        console.log("Send Lib:", sendLib);
        console.log("DVN 1:", dvn1);
        console.log("DVN 2:", dvn2);
        console.log("Executor:", executor);

        vm.startBroadcast(vm.envUint("POLYGON_DEPLOYER_PRIVATE_KEY"));

        // 1. Set send library
        ILayerZeroEndpointV2(endpoint)
            .setSendLibrary(reader, remoteEid, sendLib);
        console.log("Send library set");

        // 2. Set send ULN config (DVN + executor for outgoing messages to Ethereal)
        address[] memory requiredDVNs = _sortDVNs(dvn1, dvn2);
        address[] memory optionalDVNs = new address[](0);

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(15))),
            requiredDVNCount: 2,
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: optionalDVNs
        });

        ExecutorConfig memory execConfig = ExecutorConfig({
            maxMessageSize: uint32(
                vm.envOr("MAX_MESSAGE_SIZE", uint256(10_000))
            ),
            executor: executor
        });

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] =
            SetConfigParam(remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig));
        params[1] = SetConfigParam(
            remoteEid, EXECUTOR_CONFIG_TYPE, abi.encode(execConfig)
        );

        ILayerZeroEndpointV2(endpoint).setConfig(reader, sendLib, params);
        console.log("Send DVN/Executor config set (2 DVNs)");

        vm.stopBroadcast();

        console.log("");
        console.log("=== DVN Configuration Complete (CT Reader) ===");
    }

    function _sortDVNs(address dvn1, address dvn2)
        internal
        pure
        returns (address[] memory)
    {
        address[] memory dvns = new address[](2);
        if (uint160(dvn1) < uint160(dvn2)) {
            dvns[0] = dvn1;
            dvns[1] = dvn2;
        } else {
            dvns[0] = dvn2;
            dvns[1] = dvn1;
        }
        return dvns;
    }
}
