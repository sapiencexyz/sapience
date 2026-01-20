// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { MockERC20 } from "../../../../test/v2/mocks/MockERC20.sol";

/// @title Deploy Collateral Token
/// @notice Deploys a mock ERC20 token for collateral (simulating USDC/WUSDe)
contract DeployCollateral is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 initialSupply = 1_000_000 ether; // 1M tokens

        console.log("=== Deploy Collateral Token ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        MockERC20 collateral = new MockERC20("Test USDC", "tUSDC", 18);

        // Mint initial supply to deployer
        collateral.mint(deployer, initialSupply);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("Collateral Token:", address(collateral));
        console.log("Initial Supply:", initialSupply);
        console.log("");
        console.log("Add to .env:");
        console.log("COLLATERAL_TOKEN_ADDRESS=", address(collateral));
    }
}
