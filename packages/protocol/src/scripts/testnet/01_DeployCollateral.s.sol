// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { MockERC20 } from "../../../test/mocks/MockERC20.sol";

/// @title Deploy Collateral Token
/// @notice Deploys a mock ERC20 token for collateral (simulating USDC/WUSDe)
contract DeployCollateral is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        uint256 initialSupply =
            vm.envOr("COLLATERAL_INITIAL_SUPPLY", uint256(1_000_000 ether));
        string memory name = vm.envOr("COLLATERAL_NAME", string("Test USDe"));
        string memory symbol = vm.envOr("COLLATERAL_SYMBOL", string("tUSDe"));

        console.log("=== Deploy Collateral Token ===");
        console.log("Deployer:", deployer);
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Initial Supply:", initialSupply);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        MockERC20 collateral = new MockERC20(name, symbol, 18);

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
