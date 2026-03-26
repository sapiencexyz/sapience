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

/// @title Set DVN Configuration for SM Network Bridge
/// @notice Configures SendLib, ReceiveLib, DVN, and Executor for the Arbitrum bridge
/// @dev Supports 1 or 2 DVNs via env vars. Set SM_NETWORK_DVN_1 (required) and
///      SM_NETWORK_DVN_2 (optional). ULN_CONFIRMATIONS defaults to 1.
contract SetDVN_RemoteBridge is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        address bridge = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        address endpoint = vm.envAddress("SM_NETWORK_LZ_ENDPOINT");
        uint32 remoteEid = uint32(vm.envUint("PM_NETWORK_LZ_EID"));

        // Library addresses
        address sendLib = vm.envAddress("SM_NETWORK_SEND_LIB");
        address receiveLib = vm.envAddress("SM_NETWORK_RECEIVE_LIB");
        address dvn1 = vm.envAddress("SM_NETWORK_DVN_1");
        address dvn2 = vm.envOr("SM_NETWORK_DVN_2", address(0));
        address executor = vm.envAddress("SM_NETWORK_EXECUTOR");

        uint64 confirmations = uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(1)));
        bool useTwoDVNs = dvn2 != address(0);

        console.log("=== Set DVN for SM Network Bridge ===");
        console.log("Bridge:", bridge);
        console.log("Endpoint:", endpoint);
        console.log("Remote EID (Ethereal):", remoteEid);
        console.log("Send Lib:", sendLib);
        console.log("Receive Lib:", receiveLib);
        console.log("DVN 1:", dvn1);
        if (useTwoDVNs) console.log("DVN 2:", dvn2);
        console.log("Executor:", executor);
        console.log("Confirmations:", confirmations);

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // 1. Set send library
        ILayerZeroEndpointV2(endpoint)
            .setSendLibrary(bridge, remoteEid, sendLib);
        console.log("Send library set");

        // 2. Set receive library
        uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0)));
        ILayerZeroEndpointV2(endpoint)
            .setReceiveLibrary(bridge, remoteEid, receiveLib, gracePeriod);
        console.log("Receive library set");

        // 3. Set receive ULN config
        address[] memory requiredDVNs = _buildDVNArray(dvn1, dvn2);
        _setReceiveConfig(
            endpoint, bridge, remoteEid, receiveLib, requiredDVNs, confirmations
        );
        console.log("Receive DVN config set");

        // 4. Set send ULN config + executor
        _setSendConfig(
            endpoint,
            bridge,
            remoteEid,
            sendLib,
            requiredDVNs,
            confirmations,
            executor
        );
        console.log("Send DVN/Executor config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== DVN Configuration Complete ===");
    }

    function _buildDVNArray(address dvn1, address dvn2)
        internal
        pure
        returns (address[] memory)
    {
        if (dvn2 == address(0)) {
            address[] memory dvns = new address[](1);
            dvns[0] = dvn1;
            return dvns;
        }
        // Sort DVNs in ascending order (required by LayerZero)
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

    function _setReceiveConfig(
        address endpoint,
        address oapp,
        uint32 remoteEid,
        address receiveLib,
        address[] memory requiredDVNs,
        uint64 confirmations
    ) internal {
        address[] memory optionalDVNs = new address[](0);

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: confirmations,
            requiredDVNCount: uint8(requiredDVNs.length),
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: optionalDVNs
        });

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] =
            SetConfigParam(remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig));

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, receiveLib, params);
    }

    function _setSendConfig(
        address endpoint,
        address oapp,
        uint32 remoteEid,
        address sendLib,
        address[] memory requiredDVNs,
        uint64 confirmations,
        address executor
    ) internal {
        address[] memory optionalDVNs = new address[](0);

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: confirmations,
            requiredDVNCount: uint8(requiredDVNs.length),
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

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params);
    }
}
