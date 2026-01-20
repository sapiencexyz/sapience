// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge Back
/// @notice Bridge tokens from Arbitrum back to Ethereal
contract TestBridgeBack is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("ARB_BRIDGE_ADDRESS");
        address recipient = vm.envAddress("DEPLOYER_ADDRESS");
        bytes32 pickConfigId = vm.envBytes32("PICK_CONFIG_ID");
        bool isPredictorToken = true;

        PositionTokenBridgeRemote bridge = PositionTokenBridgeRemote(payable(bridgeAddr));

        // Get bridged token address
        address tokenAddr = bridge.getTokenAddress(pickConfigId, isPredictorToken);
        require(tokenAddr != address(0), "Token not deployed");

        IERC20 token = IERC20(tokenAddr);
        uint256 balance = token.balanceOf(recipient);

        console.log("=== Bridge Test: Arbitrum -> Ethereal ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Bridged Token:", tokenAddr);
        console.log("Recipient:", recipient);
        console.log("Current balance:", balance);

        require(balance > 0, "No bridged tokens to bridge back");

        // Bridge back half the balance
        uint256 amount = balance / 2;
        if (amount == 0) amount = balance;
        console.log("Amount to bridge back:", amount);

        // Quote fee
        MessagingFee memory fee = bridge.quoteBridge(tokenAddr, amount);
        console.log("LZ Fee (native):", fee.nativeFee);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Approve
        token.approve(bridgeAddr, amount);
        console.log("Approved bridge to spend tokens");

        // Bridge back
        bytes32 bridgeId = bridge.bridge{value: fee.nativeFee}(
            tokenAddr,
            recipient,
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Back Initiated ===");
        console.log("BridgeId:", vm.toString(bridgeId));
        console.log("");
        console.log("Next steps:");
        console.log("1. Wait 1-2 minutes for LayerZero message delivery");
        console.log("2. Check token balance on Ethereal");
        console.log("3. Track on https://testnet.layerzeroscan.com/");
    }
}
