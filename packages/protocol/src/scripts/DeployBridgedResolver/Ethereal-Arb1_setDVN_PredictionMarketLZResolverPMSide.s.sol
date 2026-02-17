// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolver} from "../../predictionMarket/resolvers/PredictionMarketLZResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";

// Configure the PM-side LZ resolver on Ethereal to trust UMA-side peer and set gas params
contract SetDVNredictionMarketLZResolverPMSide is Script {
    uint32 constant RECEIVE_CONFIG_TYPE = 2;

    function run() external {
        // Read from environment:
        //   PM_LZ_RESOLVER   - Deployed PredictionMarketLZResolver on Ethereal
        //   UMA_SIDE_RESOLVER - Deployed PredictionMarketLZResolverUmaSide on Arbitrum
        //   UMA_SIDE_EID     - Arbitrum One eid (e.g., 30110)
        //   PM_SIDE_EID      - Ethereal eid (e.g., 30391)
        //   ETHEREAL_LZ_ENDPOINT - LayerZero endpoint on Ethereal
        //   ETHEREAL_SEND_LIB - Send library address on Ethereal
        //   ETHEREAL_RECEIVE_LIB - Receive library address on Ethereal
        //   ETHEREAL_DVN - Required DVN address on Ethereal
        address umaSideResolver = vm.envAddress("UMA_SIDE_RESOLVER");
        address pmLzResolver = vm.envAddress("PM_LZ_RESOLVER");
        uint32 umaSideEid = uint32(vm.envUint("UMA_SIDE_EID"));
        uint32 pmSideEid = uint32(vm.envUint("PM_SIDE_EID"));

        uint32 AEid = umaSideEid;         // Source chain EID (Arbitrum)
        uint32 BEid = pmSideEid;         // Destination chain EID (Ethereal)
        uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0))); // Grace period for library switch

        // Library addresses
        address sendLib = vm.envAddress("ETHEREAL_SEND_LIB");
        address receiveLib = vm.envAddress("ETHEREAL_RECEIVE_LIB");

        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address oapp = pmLzResolver;         // OApp on Chain B
        uint32 eid = AEid;      // Endpoint ID for Chain A


        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        // Set send library for outbound messages
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,    // OApp address
            AEid,  // Destination chain EID
            sendLib  // SendUln302 address
        );

        // Set receive library for inbound messages
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
            oapp,        // OApp address
            AEid,      // Source chain EID
            receiveLib,  // ReceiveUln302 address
            gracePeriod  // Grace period for library switch
        );

        /// @notice UlnConfig controls verification threshold for incoming messages from A to B
        /// @notice Receive config enforces these settings have been applied to the DVNs for messages received from A
        /// @dev 0 values will be interpretted as defaults, so to apply NIL settings, use:
        /// @dev uint8 internal constant NIL_DVN_COUNT = type(uint8).max;
        /// @dev uint64 internal constant NIL_CONFIRMATIONS = type(uint64).max;
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = vm.envAddress("ETHEREAL_DVN");
        address[] memory optionalDVNs = new address[](0);
        UlnConfig memory uln = UlnConfig({
            confirmations:      uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(20))),                                       // min block confirmations from source (A)
            requiredDVNCount:   uint8(vm.envOr("REQUIRED_DVN_COUNT", uint256(1))),                                        // required DVNs for message acceptance
            optionalDVNCount:   type(uint8).max,                          // optional DVNs count
            optionalDVNThreshold: 0,                                      // optional DVN threshold
            requiredDVNs:       requiredDVNs, // sorted required DVNs
            optionalDVNs:       optionalDVNs                                        // no optional DVNs
        });

        bytes memory encodedUln = abi.encode(uln);

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] = SetConfigParam(eid, RECEIVE_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, receiveLib, params); // Set config for messages received on B from A
        vm.stopBroadcast();
    }
}


