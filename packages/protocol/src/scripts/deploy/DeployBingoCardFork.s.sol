// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { BingoCard } from "../../bingo/BingoCard.sol";
import { MockEntropy } from "../../../test/mocks/MockEntropy.sol";

/// @title Deploy BingoCard against a forked chain
/// @notice For local fork testing only. Deploys a MockEntropy alongside so
///         reveals can be driven manually via `pushCallback`.
///
/// Env:
///   - PM_NETWORK_DEPLOYER_PRIVATE_KEY  signer key
///   - PM_NETWORK_DEPLOYER_ADDRESS      deployer EOA (also the owner)
///   - COLLATERAL_TOKEN_ADDRESS         wUSDe address on the forked chain
///   - ENTROPY_FEE_WEI                  optional, defaults to 1 wei
contract DeployBingoCardFork is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address collateral = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        uint128 fee = uint128(vm.envOr("ENTROPY_FEE_WEI", uint256(1)));

        console.log("=== Deploy BingoCard (fork) ===");
        console.log("Deployer:", deployer);
        console.log("Collateral:", collateral);
        console.log("MockEntropy fee (wei):", fee);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        MockEntropy entropy = new MockEntropy();
        entropy.setFee(fee);

        BingoCard bingo =
            new BingoCard(collateral, address(entropy), deployer, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("MockEntropy:", address(entropy));
        console.log("BingoCard:  ", address(bingo));
        console.log("");
        console.log("Next steps (admin UI handles the rest):");
        console.log(
            "  1. Paste the BingoCard address into the FE 'Contract address' field"
        );
        console.log(
            "  2. Set pool, card price, multipliers, expiry from /admin"
        );
        console.log("  3. Mint a card from /play");
        console.log(
            "  4. Push the entropy callback from the admin 'Pending reveals' section"
        );
    }
}
