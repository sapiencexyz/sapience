// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge to Remote
/// @notice Bridge tokens from Ethereal to Arbitrum
contract TestBridgeToRemote is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ETHEREAL_BRIDGE_ADDRESS");
        address tokenAddr = vm.envAddress("TEST_TOKEN_ADDRESS");
        address recipient = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 amount = 0.1 ether; // 0.1 tokens (18 decimals)

        PositionTokenBridge bridge = PositionTokenBridge(payable(bridgeAddr));
        IERC20 token = IERC20(tokenAddr);

        console.log("=== Bridge Test: Ethereal -> Arbitrum ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Token:", tokenAddr);
        console.log("Recipient:", recipient);
        console.log("Amount:", amount);

        // Check balance
        uint256 balance = token.balanceOf(recipient);
        console.log("Current balance:", balance);
        require(balance >= amount, "Insufficient token balance");

        // Quote fee
        MessagingFee memory fee = bridge.quoteBridge(tokenAddr, amount);
        console.log("LZ Fee (native):", fee.nativeFee);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Approve
        token.approve(bridgeAddr, amount);
        console.log("Approved bridge to spend tokens");

        // Bridge
        bytes32 bridgeId = bridge.bridge{value: fee.nativeFee}(
            tokenAddr,
            recipient,
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Initiated ===");
        console.log("BridgeId:", vm.toString(bridgeId));
        console.log("");
        console.log("Next steps:");
        console.log("1. Wait 1-2 minutes for LayerZero message delivery");
        console.log("2. Check bridge status on Arbitrum");
        console.log("3. Track on https://testnet.layerzeroscan.com/");
    }
}
