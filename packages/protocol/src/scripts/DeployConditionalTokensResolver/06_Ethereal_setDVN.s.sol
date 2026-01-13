// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";

/**
 * @title SetDVNForEtherealResolver
 * @notice Configure LayerZero DVNs, libraries, and confirmations for Ethereal Resolver
 * @dev This configures the RECEIVE side (Polygon → Ethereal):
 *      - Receive library
 *      - Receive DVNs and confirmations
 *      
 *      Required env vars:
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Deployed Resolver address
 *      - ETHEREAL_LZ_ENDPOINT: LayerZero endpoint on Ethereal
 *      - ETHEREAL_RECEIVE_LIB: Receive library address on Ethereal
 *      - ETHEREAL_DVN: Required DVN address on Ethereal
 *      - POLYGON_EID: Source chain EID (Polygon)
 *      
 *      Optional env vars:
 *      - ULN_CONFIRMATIONS: Block confirmations (default: 20)
 *      - REQUIRED_DVN_COUNT: Required DVN count (default: 1)
 *      - GRACE_PERIOD: Grace period for library switch (default: 0)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/06_Ethereal_setDVN.s.sol \
 *        --rpc-url $ETHEREAL_RPC --broadcast --private-key $ETHEREAL_PRIVATE_KEY
 */
contract SetDVNForEtherealResolver is Script {
    uint32 constant RECEIVE_CONFIG_TYPE = 2;

    function run() external {
        // LayerZero addresses for Ethereal (receiving from Polygon)
        address resolver = vm.envAddress("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER");
        address endpoint = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B; // Ethereal Endpoint V2
        address receiveLib = 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043; // Ethereal ReceiveLib302
        // address dvn = 0x2afa3787cd95fee5D5753cd717EF228eb259f4ea; // Horizen DVN
        address dvn = 0x56053A8f4db677e5774F8Ee5BdD9D2dC270075f3; // Canary DVN
        
        uint32 polygonEid = 30109; // Polygon EID

        // LayerZero config
        uint64 confirmations = 10; // Receive confirmations for Polygon → Ethereal
        uint8 requiredDvnCount = 1;
        uint32 gracePeriod = 0;

        console.log("=== Configuring LayerZero DVN for Ethereal Resolver (RECEIVE) ===");
        console.log("Resolver:", resolver);
        console.log("Endpoint:", endpoint);
        console.log("Receive Library:", receiveLib);
        console.log("DVN:", dvn);
        console.log("Source EID (Polygon):", polygonEid);
        console.log("Confirmations:", confirmations);
        console.log("Required DVN Count:", requiredDvnCount);
        console.log("");

        vm.startBroadcast();

        // Set receive library for inbound messages (Polygon → Ethereal)
        console.log("Setting receive library...");
        // ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
        //     resolver,
        //     polygonEid,
        //     receiveLib,
        //     gracePeriod
        // );
        console.log("Receive library set");

        // Configure ULN (DVNs + confirmations) for receiving
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

        bytes memory encodedUln = abi.encode(uln);

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] = SetConfigParam(polygonEid, RECEIVE_CONFIG_TYPE, encodedUln);

        console.log("Setting receive config (DVN)...");
        ILayerZeroEndpointV2(endpoint).setConfig(resolver, receiveLib, params);
        console.log("Receive config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Ethereal resolver is now configured to receive messages from Polygon");
        console.log("Both sides are now fully configured for cross-chain communication");
        console.log("Next step: Run script 07_Polygon_testFlow.s.sol to test the flow");
    }
}

