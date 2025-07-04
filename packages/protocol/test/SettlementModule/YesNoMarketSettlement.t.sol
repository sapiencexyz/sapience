// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {MockOptimisticOracleV3} from "../bridge/mocks/mockOptimisticOracleV3.sol";
import {OptimisticOracleV3Interface} from
    "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract YesNoMarketSettlementTest is Test {
    using Cannon for Vm;

    // Claim statements for Yes/No market
    bytes constant CLAIM_STATEMENT_YES = "Will Bitcoin reach $100,000 by the end of 2024?";
    bytes constant CLAIM_STATEMENT_NO = "Bitcoin will NOT reach $100,000 by the end of 2024.";

    // Market parameters
    uint160 INITIAL_PRICE_SQRT = 56022770974786143748341366784; // 0.5
    int24 MARKET_LOWER_TICK = -92200; // 0.0001 (No outcome)
    int24 MARKET_UPPER_TICK = 0; // 1.0 (Yes outcome)
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    // Settlement prices for Yes/No outcomes
    uint160 SETTLEMENT_PRICE_YES_SQRT = 79228162514264337593543950336; // 1.0
    uint160 SETTLEMENT_PRICE_NO_SQRT = 0; // 0.0

    address marketOwner;
    uint256 newMarketId;
    IMintableToken newBondCurrency;
    MockOptimisticOracleV3 newMockOracle;
    ISapience mockSapience;

    function setUp() public {
        // Deploy a new mock oracle
        newMockOracle = new MockOptimisticOracleV3(address(0));

        // Use a unique salt and owner for each test
        bytes32 testSalt = keccak256(
            abi.encodePacked("test_YesNoMarket_VerifyClaim_WithMockOracle", block.timestamp, block.prevrandao)
        );
        uint256 saltNum = uint256(testSalt) % type(uint256).max;
        marketOwner = address(uint160(uint256(keccak256(abi.encodePacked("owner", testSalt)))));
        address[] memory feeCollectors = new address[](0);
        mockSapience = ISapience(vm.getAddress("Sapience"));

        // Initialize market group with unique owner
        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        mockSapience.initializeMarketGroup(
            marketOwner,
            vm.getAddress("CollateralAsset.Token"),
            feeCollectors,
            MIN_TRADE_SIZE,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: 5 ether,
                uniswapPositionManager: vm.getAddress("Uniswap.NonfungiblePositionManager"),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.QuoterV2"),
                optimisticOracleV3: address(newMockOracle)
            })
        );
        vm.stopPrank();

        // Create market with unique salt
        vm.startPrank(marketOwner);
        mockSapience.createMarket(
            ISapienceStructs.MarketCreationParams({
                startTime: block.timestamp,
                endTime: block.timestamp + 30 days,
                startingSqrtPriceX96: INITIAL_PRICE_SQRT,
                baseAssetMinPriceTick: MARKET_LOWER_TICK,
                baseAssetMaxPriceTick: MARKET_UPPER_TICK,
                salt: saltNum,
                claimStatementYesOrNumeric: CLAIM_STATEMENT_YES,
                claimStatementNo: CLAIM_STATEMENT_NO
            })
        );

        // Get the new market data
        (ISapienceStructs.MarketData memory marketData,) = mockSapience.getLatestMarket();
        newMarketId = marketData.marketId;

        // Setup bond currency for the new market
        newBondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        newBondCurrency.mint(10 ether, marketOwner);

        newBondCurrency.approve(address(mockSapience), 5 ether);
        vm.stopPrank();

        // Avanza el tiempo para permitir el settlement
        vm.warp(block.timestamp + 31 days);
    }

    function test_YesNoMarket_VerifyClaim_WithMockOracle_Yes() public {
        // Submit settlement price for Yes outcome
        vm.startPrank(marketOwner);
        bytes32 assertionId = mockSapience.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: newMarketId,
                asserter: marketOwner,
                settlementSqrtPriceX96: SETTLEMENT_PRICE_YES_SQRT
            })
        );
        vm.stopPrank();

        // Get the assertion data from the mock oracle
        MockOptimisticOracleV3.AssertionData memory assertionData = newMockOracle.getAssertionData(assertionId);

        // Verify the claim is correct for Yes outcome
        assertEq(assertionData.claim, CLAIM_STATEMENT_YES, "Claim should be Yes statement for Yes outcome");
    }

    function test_YesNoMarket_VerifyClaim_WithMockOracle_No() public {
        // Now test No outcome
        vm.startPrank(marketOwner);

        bytes32 assertionIdNo = mockSapience.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: newMarketId,
                asserter: marketOwner,
                settlementSqrtPriceX96: SETTLEMENT_PRICE_NO_SQRT
            })
        );
        vm.stopPrank();

        // Get the assertion data for No outcome
        MockOptimisticOracleV3.AssertionData memory assertionDataNo = newMockOracle.getAssertionData(assertionIdNo);

        // Verify the claim is correct for No outcome
        assertEq(assertionDataNo.claim, CLAIM_STATEMENT_NO, "Claim should be No statement for No outcome");
    }
}
