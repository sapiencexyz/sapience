// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ParlayNFT} from "../parlay/ParlayNFT.sol";
import {ParlayPool} from "../parlay/ParlayPool.sol";
import {IParlayStructs} from "../parlay/interfaces/IParlayStructs.sol";

contract DeployParlayPool is Script {
    function run() external {
        // Configuration - replace these with your own values
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN"); // sUSDe address
        
        // ParlayPool configuration
        uint256 maxParlayMarkets = 5; // Maximum number of markets per parlay
        uint256 minCollateral = 100000000000000000000; // 100 sUSDe (18 decimals)
        uint256 minRequestExpirationTime = 30; // 30 seconds minimum
        uint256 maxRequestExpirationTime = 86400; // 1 day maximum
        
        // Approved takers (empty array means anyone can fill)
        address[] memory approvedTakers = new address[](0); // No restrictions

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // Step 1: Deploy NFT contracts
        console.log("Deploying ParlayNFT contracts...");
        
        ParlayNFT makerNFT = new ParlayNFT("Parlay Maker", "PMKR");
        console.log("Maker NFT deployed to:", address(makerNFT));
        
        ParlayNFT takerNFT = new ParlayNFT("Parlay Taker", "PTKR");
        console.log("Taker NFT deployed to:", address(takerNFT));

        // Step 2: Deploy ParlayPool
        console.log("Deploying ParlayPool...");
        
        ParlayPool pool = new ParlayPool(
            collateralToken,
            address(makerNFT),
            address(takerNFT),
            maxParlayMarkets,
            minCollateral,
            minRequestExpirationTime,
            maxRequestExpirationTime,
            approvedTakers
        );
        console.log("ParlayPool deployed to:", address(pool));

        // Step 3: Transfer NFT ownership to ParlayPool
        console.log("Transferring NFT ownership to ParlayPool...");
        
        makerNFT.transferOwnership(address(pool));
        console.log("Maker NFT ownership transferred to ParlayPool");
        
        takerNFT.transferOwnership(address(pool));
        console.log("Taker NFT ownership transferred to ParlayPool");

        vm.stopBroadcast();

        // Step 4: Verify configuration
        console.log("\n=== Deployment Summary ===");
        console.log("ParlayPool:", address(pool));
        console.log("Maker NFT:", address(makerNFT));
        console.log("Taker NFT:", address(takerNFT));
        console.log("Collateral Token:", collateralToken);
        console.log("Max Parlay Markets:", maxParlayMarkets);
        console.log("Min Collateral:", minCollateral);
        console.log("Min Expiration Time:", minRequestExpirationTime, "seconds");
        console.log("Max Expiration Time:", maxRequestExpirationTime, "seconds");
        
        // Verify ownership transfers
        console.log("\n=== Ownership Verification ===");
        console.log("Maker NFT owner:", makerNFT.owner());
        console.log("Taker NFT owner:", takerNFT.owner());
        console.log("Expected owner (ParlayPool):", address(pool));
        
        // Get ParlayPool configuration
        IParlayStructs.Settings memory config = pool.getConfig();
        
        console.log("\n=== ParlayPool Configuration ===");
        console.log("Collateral Token:", config.collateralToken);
        console.log("Maker NFT:", config.makerNft);
        console.log("Taker NFT:", config.takerNft);
        console.log("Max Parlay Markets:", config.maxParlayMarkets);
        console.log("Min Collateral:", config.minCollateral);
        console.log("Min Expiration Time:", config.minRequestExpirationTime);
        console.log("Max Expiration Time:", config.maxRequestExpirationTime);
        
        console.log("\n=== Deployment Complete ===");
        console.log("ParlayPool system is ready for use!");
        console.log("Users can now:");
        console.log("1. Approve sUSDe spending to ParlayPool");
        console.log("2. Submit parlay orders as makers");
        console.log("3. Fill parlay orders as takers");
    }
} 