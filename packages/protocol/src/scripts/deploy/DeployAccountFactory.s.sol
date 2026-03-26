// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ZeroDevKernelAccountFactory
} from "../../utils/ZeroDevKernelAccountFactory.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";

/// @title Deploy ZeroDev Account Factory
/// @notice Deploys wrapper and configures it on PredictionMarketEscrow
contract DeployAccountFactory is Script {
    // ZeroDev Kernel V3.1 addresses (same on all chains)
    address constant KERNEL_FACTORY =
        0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419;
    address constant ECDSA_VALIDATOR =
        0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;

    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address escrowAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");

        console.log("=== Deploy ZeroDev Account Factory ===");
        console.log("Deployer:", deployer);
        console.log("Escrow:", escrowAddress);
        console.log("Kernel Factory:", KERNEL_FACTORY);
        console.log("ECDSA Validator:", ECDSA_VALIDATOR);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // Deploy wrapper
        ZeroDevKernelAccountFactory factory =
            new ZeroDevKernelAccountFactory(KERNEL_FACTORY, ECDSA_VALIDATOR);

        console.log("ZeroDevKernelAccountFactory deployed:", address(factory));

        // Configure on escrow
        PredictionMarketEscrow escrow = PredictionMarketEscrow(escrowAddress);
        escrow.setAccountFactory(address(factory));

        console.log("AccountFactory configured on escrow");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("ACCOUNT_FACTORY_ADDRESS=", address(factory));
    }
}
