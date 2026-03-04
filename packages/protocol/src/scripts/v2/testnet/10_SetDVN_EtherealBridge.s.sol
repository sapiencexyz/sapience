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

/// @title Set DVN Configuration for PM Network Bridge
/// @notice Configures SendLib, ReceiveLib, DVN, and Executor for the Ethereal bridge
contract SetDVN_EtherealBridge is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        address bridge = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address endpoint = vm.envAddress("PM_NETWORK_LZ_ENDPOINT");
        uint32 remoteEid = uint32(vm.envUint("SM_NETWORK_LZ_EID"));

        // Library addresses
        address sendLib = vm.envAddress("PM_NETWORK_SEND_LIB");
        address receiveLib = vm.envAddress("PM_NETWORK_RECEIVE_LIB");
        address dvn = vm.envAddress("PM_NETWORK_DVN");

        // Optional executor (for send config)
        address executor = vm.envOr("PM_NETWORK_EXECUTOR", address(0));

        console.log("=== Set DVN for PM Network Bridge ===");
        console.log("Bridge:", bridge);
        console.log("Endpoint:", endpoint);
        console.log("Remote EID:", remoteEid);
        console.log("Send Lib:", sendLib);
        console.log("Receive Lib:", receiveLib);
        console.log("DVN:", dvn);
        if (executor != address(0)) {
            console.log("Executor:", executor);
        }

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // 1. Set send library
        ILayerZeroEndpointV2(endpoint)
            .setSendLibrary(bridge, remoteEid, sendLib);
        console.log("Send library set");

        // 2. Set receive library
        uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0)));
        ILayerZeroEndpointV2(endpoint)
            .setReceiveLibrary(bridge, remoteEid, receiveLib, gracePeriod);
        console.log("Receive library set");

        // 3. Set receive ULN config (DVN for incoming messages)
        _setReceiveConfig(endpoint, bridge, remoteEid, receiveLib, dvn);
        console.log("Receive DVN config set");

        // 4. Set send ULN config (DVN for outgoing messages)
        _setSendConfig(endpoint, bridge, remoteEid, sendLib, dvn, executor);
        console.log("Send DVN config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== DVN Configuration Complete ===");
    }

    function _setReceiveConfig(
        address endpoint,
        address oapp,
        uint32 remoteEid,
        address receiveLib,
        address dvn
    ) internal {
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = dvn;
        address[] memory optionalDVNs = new address[](0);

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(1))),
            requiredDVNCount: 1,
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
        address dvn,
        address executor
    ) internal {
        // DVN config for send
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = dvn;
        address[] memory optionalDVNs = new address[](0);

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(1))),
            requiredDVNCount: 1,
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: optionalDVNs
        });

        SetConfigParam[] memory params;

        if (executor != address(0)) {
            // Set both DVN and executor config
            ExecutorConfig memory execConfig = ExecutorConfig({
                maxMessageSize: uint32(
                    vm.envOr("MAX_MESSAGE_SIZE", uint256(10_000))
                ),
                executor: executor
            });

            params = new SetConfigParam[](2);
            params[0] = SetConfigParam(
                remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig)
            );
            params[1] = SetConfigParam(
                remoteEid, EXECUTOR_CONFIG_TYPE, abi.encode(execConfig)
            );
        } else {
            // Just set DVN config
            params = new SetConfigParam[](1);
            params[0] = SetConfigParam(
                remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig)
            );
        }

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params);
    }
}
