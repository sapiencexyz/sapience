// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";
import {
    IPredictionMarketBridgeBase
} from "../../bridge/interfaces/IPredictionMarketBridgeBase.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Retry Bridge from PM Network (Mainnet)
/// @notice Retry a pending bridge from Ethereal to Arbitrum
/// @dev Use this when the original bridge or ACK failed
contract RetryBridgePM is Script {
    uint32 constant ETHEREAL_EID = 30_391;
    uint32 constant ARBITRUM_EID = 30_110;

    function run() external {
        address bridgeAddr = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        bytes32 bridgeId = vm.envBytes32("BRIDGE_ID");
        bytes32 refCode = vm.envOr("REF_CODE", bytes32(0));

        uint256 deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");

        PredictionMarketBridge bridge =
            PredictionMarketBridge(payable(bridgeAddr));

        console.log("=== Retry Bridge from PM Network (Mainnet) ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Bridge ID:");
        console.logBytes32(bridgeId);

        // Get pending bridge info
        IPredictionMarketBridgeBase.PendingBridge memory pending =
            bridge.getPendingBridge(bridgeId);

        console.log("");
        console.log("=== Pending Bridge Info ===");
        console.log("Token:", pending.token);
        console.log("Sender:", pending.sender);
        console.log("Recipient:", pending.recipient);
        console.log("Amount:", pending.amount);
        console.log("Status:", uint256(pending.status));
        console.log("Created At:", pending.createdAt);
        console.log("Last Retry At:", pending.lastRetryAt);

        require(
            pending.status == IPredictionMarketBridgeBase.BridgeStatus.PENDING,
            "Bridge not in PENDING status"
        );

        // Quote retry fee
        MessagingFee memory fee = bridge.quoteRetry(bridgeId);
        console.log("");
        console.log("=== Retry Fee ===");
        console.log("Native Fee:", fee.nativeFee);

        vm.startBroadcast(deployerPk);

        bridge.retry{ value: fee.nativeFee }(bridgeId, refCode);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Retry Initiated ===");
        console.log("Bridge ID:", vm.toString(bridgeId));
        console.log("");
        console.log("=== LayerZero Tracking ===");
        console.log("Source Chain EID:", ETHEREAL_EID);
        console.log("Destination Chain EID:", ARBITRUM_EID);
        console.log("OApp (sender):", bridgeAddr);
        console.log("");
        console.log(
            "NOTE: Use the transaction hash from forge output above to track on LayerZero Scan"
        );
        console.log("https://layerzeroscan.com/");
    }
}
