// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { BingoCardReceipt } from "../../bingo/BingoCardReceipt.sol";

/// @title Deploy BingoCardReceipt on Ethereal testnet (staging)
/// @notice Receipt NFT + payout rail for COMBO.BINGO. The game runs through
///         the bingo-server backend; this contract is the public
///         record (cards, fairness seeds, referrers) and the payout path
///         (treasury → NFT owner / referrer). It never holds funds.
///
/// The deployer key only broadcasts; ownership lands on TREASURY_ADDRESS.
/// The deploy runs as the deployer (so setMinter passes onlyOwner), then
/// transfers ownership to the treasury — which becomes the admin SIWE
/// identity and the wallet payBonus/payReferral pull funds from. The
/// treasury's private key is never needed here.
///
/// Required env:
///   - PM_NETWORK_DEPLOYER_PRIVATE_KEY  broadcast signer (pays gas)
///   - PM_NETWORK_DEPLOYER_ADDRESS      deployer EOA
///   - TREASURY_ADDRESS                 final owner: admin sign-in wallet +
///                                      bonus/referral payout source
///
/// Optional env (testnet defaults):
///   - COLLATERAL_TOKEN_ADDRESS  wUSDe payout token; Ethereal testnet default.
///   - MINTER_ADDRESS            The bingo-server minter's ZeroDev SMART
///                               ACCOUNT address (mints are sponsored
///                               UserOps, not EOA txs — the server logs this
///                               address at boot). Defaults to the deployer;
///                               the treasury can setMinter later.
contract DeployBingoCardReceipt is Script {
    address constant TESTNET_COLLATERAL =
        0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90;

    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address collateral =
            vm.envOr("COLLATERAL_TOKEN_ADDRESS", TESTNET_COLLATERAL);
        address minter = vm.envOr("MINTER_ADDRESS", deployer);
        require(treasury != address(0), "TREASURY_ADDRESS is zero");

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));
        // Own as the deployer just long enough to set the minter, then hand
        // the contract to the treasury.
        BingoCardReceipt receipt = new BingoCardReceipt(collateral, deployer);
        receipt.setMinter(minter);
        if (treasury != deployer) {
            receipt.transferOwnership(treasury);
        }
        vm.stopBroadcast();

        console.log("=== Deployed (Ethereal testnet) ===");
        console.log("BingoCardReceipt:", address(receipt));
        console.log("Payout token:    ", collateral);
        console.log("Minter:          ", minter);
        console.log("Owner/treasury:  ", treasury);
        console.log("");
        console.log("Next:");
        console.log("  1. Set RECEIPT_CONTRACT_ADDRESS on the bingo-server");
        console.log("  2. Set MINTER_PRIVATE_KEY on the bingo-server");
        console.log("  3. Treasury calls setMinter(<server smart account>)");
        console.log("  4. Treasury approves the contract on wUSDe for payouts");
    }
}
