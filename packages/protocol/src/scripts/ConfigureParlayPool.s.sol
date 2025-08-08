// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ParlayPool} from "../parlay/ParlayPool.sol";
import {ParlayNFT} from "../parlay/ParlayNFT.sol";
import {IParlayStructs} from "../parlay/interfaces/IParlayStructs.sol";

contract ConfigureParlayPool is Script {
    function run() view external {
        // Replace these with your deployed contract addresses
        address parlayPoolAddress = vm.envAddress("PARLAY_POOL_ADDRESS");
        address makerNftAddress = vm.envAddress("MAKER_NFT_ADDRESS");
        address takerNftAddress = vm.envAddress("TAKER_NFT_ADDRESS");
        
        ParlayPool pool = ParlayPool(parlayPoolAddress);
        ParlayNFT makerNFT = ParlayNFT(makerNftAddress);
        ParlayNFT takerNFT = ParlayNFT(takerNftAddress);

        console.log("=== ParlayPool Configuration Check ===");
        
        // Get ParlayPool configuration
        IParlayStructs.Settings memory config = pool.getConfig();
        
        console.log("ParlayPool Address:", parlayPoolAddress);
        console.log("Collateral Token:", config.collateralToken);
        console.log("Maker NFT:", config.makerNft);
        console.log("Taker NFT:", config.takerNft);
        console.log("Max Parlay Markets:", config.maxParlayMarkets);
        console.log("Min Collateral:", config.minCollateral, "wei");
        console.log("Min Expiration Time:", config.minRequestExpirationTime, "seconds");
        console.log("Max Expiration Time:", config.maxRequestExpirationTime, "seconds");
        console.log("Approved Takers Count:", config.approvedTakers.length);
        
        if (config.approvedTakers.length > 0) {
            console.log("Approved Takers:");
            for (uint256 i = 0; i < config.approvedTakers.length; i++) {
                console.log("  ", i + 1, ":", config.approvedTakers[i]);
            }
        } else {
            console.log("Approved Takers: None (anyone can fill orders)");
        }
        
        // Verify NFT ownership
        console.log("\n=== NFT Ownership Verification ===");
        console.log("Maker NFT Owner:", makerNFT.owner());
        console.log("Taker NFT Owner:", takerNFT.owner());
        console.log("Expected Owner (ParlayPool):", parlayPoolAddress);
        
        bool makerOwnershipCorrect = makerNFT.owner() == parlayPoolAddress;
        bool takerOwnershipCorrect = takerNFT.owner() == parlayPoolAddress;
        
        console.log("Maker NFT ownership correct:", makerOwnershipCorrect);
        console.log("Taker NFT ownership correct:", takerOwnershipCorrect);
        
        // Check NFT details
        console.log("\n=== NFT Contract Details ===");
        console.log("Maker NFT Name:", makerNFT.name());
        console.log("Maker NFT Symbol:", makerNFT.symbol());
        console.log("Taker NFT Name:", takerNFT.name());
        console.log("Taker NFT Symbol:", takerNFT.symbol());
        
        // Verify configuration consistency
        console.log("\n=== Configuration Verification ===");
        bool configConsistent = 
            config.makerNft == makerNftAddress &&
            config.takerNft == takerNftAddress &&
            config.maxParlayMarkets == 5 &&
            config.minCollateral == 100000000000000000000 && // 100 sUSDe (18 decimals)
            config.minRequestExpirationTime == 30 &&
            config.maxRequestExpirationTime == 86400;
            
        console.log("Configuration consistent with deployment:", configConsistent);
        
        if (!configConsistent) {
            console.log("WARNING: Configuration differs from expected deployment values!");
        }
        
        if (!makerOwnershipCorrect || !takerOwnershipCorrect) {
            console.log("WARNING: NFT ownership not correctly set!");
            console.log("The ParlayPool will not be able to mint/burn NFTs.");
        }
        
        console.log("\n=== System Status ===");
        if (configConsistent && makerOwnershipCorrect && takerOwnershipCorrect) {
            console.log("ParlayPool system is properly configured and ready for use!");
        } else {
            console.log("ParlayPool system has configuration issues that need to be resolved.");
        }
        
        console.log("\n=== Usage Instructions ===");
        console.log("1. Users must approve sUSDe spending to ParlayPool:", parlayPoolAddress);
        console.log("2. Makers can submit parlay orders with minimum collateral:", config.minCollateral, "wei");
        console.log("3. Takers can fill orders within expiration time limits");
        console.log("4. Only Yes/No markets are supported for parlays");
        console.log("5. Parlays can only be settled after 30 days from creation");
    }
} 