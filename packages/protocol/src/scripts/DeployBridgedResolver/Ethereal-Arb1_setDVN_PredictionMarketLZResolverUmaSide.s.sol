// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolverUmaSide} from "../../predictionMarket/resolvers/PredictionMarketLZResolverUmaSide.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

// Configure the UMA-side resolver on Arbitrum to point to PM-side peer and UMA settings
contract SetDVNPredictionMarketLZResolverUmaSide is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;
    
    function run() external {
        // Read from environment:
        //   UMA_SIDE_RESOLVER - Deployed UMA-side resolver (Arbitrum)
        //   PM_LZ_RESOLVER    - Deployed PM-side resolver (Ethereal)
        //   UMA_SIDE_EID      - Arbitrum One eid (e.g., 30110)
        //   PM_SIDE_EID       - Ethereal eid (e.g., 30391)
        //   ARB_LZ_ENDPOINT   - LayerZero endpoint on Arbitrum
        //   ARB_SEND_LIB      - Send library address on Arbitrum
        //   ARB_RECEIVE_LIB   - Receive library address on Arbitrum
        //   ARB_DVN           - Required DVN address on Arbitrum
        //   ARB_EXECUTOR       - Executor address on Arbitrum
        // Optional UMA params:
        //   UMA_OOV3, UMA_BOND_TOKEN, UMA_BOND_AMOUNT, UMA_ASSERTION_LIVENESS, UMA_ASSERTER
        address umaSideResolver = vm.envAddress("UMA_SIDE_RESOLVER");
        address pmLzResolver = vm.envAddress("PM_LZ_RESOLVER");
        uint32 umaSideEid = uint32(vm.envUint("UMA_SIDE_EID"));
        uint32 pmSideEid = uint32(vm.envUint("PM_SIDE_EID"));

        // Load environment variables
        address endpoint = vm.envAddress("ARB_LZ_ENDPOINT");
        address oapp = umaSideResolver;           // Your OApp contract address

        // Library addresses
        address sendLib = vm.envAddress("ARB_SEND_LIB");
        address receiveLib = vm.envAddress("ARB_RECEIVE_LIB");

        // Chain configurations
        uint32 AEid = umaSideEid;         // Source chain EID (Arbitrum)
        uint32 BEid = pmSideEid;         // Destination chain EID (Ethereal)
        uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0))); // Grace period for library switch
        

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        // Set send library for outbound messages
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,    // OApp address
            BEid,  // Destination chain EID
            sendLib  // SendUln302 address
        );

        // Set receive library for inbound messages
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
            oapp,        // OApp address
            AEid,      // Source chain EID
            receiveLib,  // ReceiveUln302 address
            gracePeriod  // Grace period for library switch
        );

        // Set executor config and EVM
        /// @notice ULNConfig defines security parameters (DVNs + confirmation threshold) for A → B
        /// @notice Send config requests these settings to be applied to the DVNs and Executor for messages sent from A to B
        /// @dev 0 values will be interpretted as defaults, so to apply NIL settings, use:
        /// @dev uint8 internal constant NIL_DVN_COUNT = type(uint8).max;
        /// @dev uint64 internal constant NIL_CONFIRMATIONS = type(uint64).max;
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = vm.envAddress("ARB_DVN");
        UlnConfig memory uln = UlnConfig({
            confirmations:        uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(20))),                                      // minimum block confirmations required on A before sending to B
            requiredDVNCount:     uint8(vm.envOr("REQUIRED_DVN_COUNT", uint256(1))),                                       // number of DVNs required
            optionalDVNCount:     type(uint8).max,                         // optional DVNs count, uint8
            optionalDVNThreshold: 0,                                       // optional DVN threshold
            requiredDVNs:        requiredDVNs, // sorted list of required DVN addresses
            optionalDVNs:        new address[](0)                                       // sorted list of optional DVNs
        });

        /// @notice ExecutorConfig sets message size limit + fee‑paying executor for A → B
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: uint32(vm.envOr("MAX_MESSAGE_SIZE", uint256(10000))),                                       // max bytes per cross-chain message
            executor:       vm.envAddress("ARB_EXECUTOR")                           // address that pays destination execution fees on B
        });

        bytes memory encodedUln  = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);


        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(BEid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(BEid, ULN_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params); // Set config for messages sent from A to B
        vm.stopBroadcast();
    }
}




