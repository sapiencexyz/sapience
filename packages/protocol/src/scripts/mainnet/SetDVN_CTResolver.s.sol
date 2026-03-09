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

/// @title Set DVN Configuration for ConditionalTokensConditionResolver (Ethereal)
/// @notice Configures ReceiveLib and DVN for the CT Resolver on Ethereal.
///         The resolver is an OAppReceiver only — it receives resolution data from Polygon.
///
/// Env vars:
///   CT_CONDITION_RESOLVER_ADDRESS  - ConditionalTokensConditionResolver on Ethereal
///   PM_NETWORK_LZ_ENDPOINT         - LayerZero endpoint on Ethereal
///   POLYGON_LZ_EID                 - Polygon LayerZero endpoint ID (source)
///   PM_NETWORK_RECEIVE_LIB         - Ethereal receive library address
///   PM_NETWORK_DVN_1, PM_NETWORK_DVN_2 - DVN addresses on Ethereal
///   PM_NETWORK_DEPLOYER_PRIVATE_KEY - Deployer (owner) private key
contract SetDVN_CTResolver is Script {
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        address resolver = vm.envAddress("CT_CONDITION_RESOLVER_ADDRESS");
        address endpoint = vm.envAddress("PM_NETWORK_LZ_ENDPOINT");
        uint32 remoteEid = uint32(vm.envUint("POLYGON_LZ_EID"));

        address receiveLib = vm.envAddress("PM_NETWORK_RECEIVE_LIB");
        address dvn1 = vm.envAddress("PM_NETWORK_DVN_1");
        address dvn2 = vm.envAddress("PM_NETWORK_DVN_2");

        console.log("=== Set DVN for CT Resolver (Ethereal) ===");
        console.log("Resolver:", resolver);
        console.log("Endpoint:", endpoint);
        console.log("Remote EID (Polygon):", remoteEid);
        console.log("Receive Lib:", receiveLib);
        console.log("DVN 1:", dvn1);
        console.log("DVN 2:", dvn2);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // 1. Set receive library
        uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0)));
        ILayerZeroEndpointV2(endpoint)
            .setReceiveLibrary(resolver, remoteEid, receiveLib, gracePeriod);
        console.log("Receive library set");

        // 2. Set receive ULN config (DVN for incoming messages from Polygon)
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

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] =
            SetConfigParam(remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig));

        ILayerZeroEndpointV2(endpoint).setConfig(resolver, receiveLib, params);
        console.log("Receive DVN config set (2 DVNs)");

        vm.stopBroadcast();

        console.log("");
        console.log("=== DVN Configuration Complete (CT Resolver) ===");
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
