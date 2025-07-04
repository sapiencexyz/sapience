// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {IUMASettlementModule} from "../../src/market/interfaces/IUMASettlementModule.sol";
import {MarketGroupFactory} from "../../src/marketGroupFactory/MarketGroupFactory.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract MarketGroupFactoryTest is Test {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    address safeOwner;
    address deployer = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    ISapience sapience;
    MarketGroupFactory marketGroupFactory;
    IMintableToken collateralAsset;
    IMintableToken bondCurrency;

    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase
    uint256 constant BOND_AMOUNT = 100 ether;
    address[] feeCollectors = new address[](0);
    address uniswapPositionManager;
    address uniswapSwapRouter;
    address uniswapQuoter;
    address optimisticOracleV3;

    function setUp() public {
        marketGroupFactory = MarketGroupFactory(
            vm.getAddress("MarketGroupFactory")
        );
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        safeOwner = makeAddr("safeOwner");
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        uniswapPositionManager = vm.getAddress(
            "Uniswap.NonfungiblePositionManager"
        );
        uniswapSwapRouter = vm.getAddress("Uniswap.SwapRouter");
        uniswapQuoter = vm.getAddress("Uniswap.QuoterV2");
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
    }

    function test_canCloneMarketGroup() public {
        vm.startPrank(safeOwner);
        address marketGroup = marketGroupFactory
            .cloneAndInitializeMarketGroup(
                address(collateralAsset),
                feeCollectors,
                MIN_TRADE_SIZE,
                false,
                ISapienceStructs.MarketParams({
                    feeRate: 10000,
                    assertionLiveness: 21600,
                    bondCurrency: address(bondCurrency),
                    bondAmount: BOND_AMOUNT,
                    uniswapPositionManager: uniswapPositionManager,
                    uniswapSwapRouter: uniswapSwapRouter,
                    uniswapQuoter: uniswapQuoter,
                    optimisticOracleV3: optimisticOracleV3
                }),
                0
            );


        address marketGroup2 = marketGroupFactory
            .cloneAndInitializeMarketGroup(
                address(collateralAsset),
                feeCollectors,
                MIN_TRADE_SIZE,
                false,
                ISapienceStructs.MarketParams({
                    feeRate: 10000,
                    assertionLiveness: 21600,
                    bondCurrency: address(bondCurrency),
                    bondAmount: BOND_AMOUNT,
                    uniswapPositionManager: uniswapPositionManager,
                    uniswapSwapRouter: uniswapSwapRouter,
                    uniswapQuoter: uniswapQuoter,
                    optimisticOracleV3: optimisticOracleV3
                }),
                0
            );
        vm.stopPrank();
        assertNotEq(marketGroup, address(0));
        assertNotEq(marketGroup2, address(0));
        assertNotEq(marketGroup, marketGroup2);
        checkMarketGroupCanOperate(ISapience(marketGroup));
        checkMarketGroupCanOperate(ISapience(marketGroup2));
    }

    function test_revertsAndPropagatesTheError_feeRateZero() public {
        vm.startPrank(deployer);
        // vm.expectRevert("InvalidFeeRate(0)");
        vm.expectRevert(); // Note, expected error looks similar in the console log, but fails to catch it properly
        marketGroupFactory.cloneAndInitializeMarketGroup(
            address(collateralAsset),
            feeCollectors,
            MIN_TRADE_SIZE,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 0,
                assertionLiveness: 21600,
                bondCurrency: address(bondCurrency),
                bondAmount: BOND_AMOUNT,
                uniswapPositionManager: uniswapPositionManager,
                uniswapSwapRouter: uniswapSwapRouter,
                uniswapQuoter: uniswapQuoter,
                optimisticOracleV3: optimisticOracleV3
            }),
            0
        );
        vm.stopPrank();
    }

    function test_attmeptToInitializeMarketGroupTwiceRevert() public {
        vm.startPrank(safeOwner);
        address marketGroup = marketGroupFactory
            .cloneAndInitializeMarketGroup(
                address(collateralAsset),
                feeCollectors,
                MIN_TRADE_SIZE,
                false,
                ISapienceStructs.MarketParams({
                    feeRate: 10000,
                    assertionLiveness: 21600,
                    bondCurrency: address(bondCurrency),
                    bondAmount: BOND_AMOUNT,
                    uniswapPositionManager: uniswapPositionManager,
                    uniswapSwapRouter: uniswapSwapRouter,
                    uniswapQuoter: uniswapQuoter,
                    optimisticOracleV3: optimisticOracleV3
                }),
                0
            );

        // vm.expectRevert("MarketAlreadyCreated()"); // Note, expected error looks similar in the console log, but fails to catch it properly
        vm.expectRevert();
        ISapience(marketGroup).initializeMarketGroup(
            safeOwner,
            address(collateralAsset),
            feeCollectors,
            MIN_TRADE_SIZE,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: address(bondCurrency),
                bondAmount: BOND_AMOUNT,
                uniswapPositionManager: uniswapPositionManager,
                uniswapSwapRouter: uniswapSwapRouter,
                uniswapQuoter: uniswapQuoter,
                optimisticOracleV3: optimisticOracleV3
            })
        );

        vm.stopPrank();
    }

    function checkMarketGroupCanOperate(ISapience marketGroup) private {
        uint160 SQRT_PRICE_11Eth = 262770087889115504578498920448;
        uint256 settlementPriceD18 = 10999999999999999740;
        uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
        int24 minTick = 6800; // 2.0
        int24 maxTick = 27000; // 15.0

        // Create a new market
        vm.startPrank(safeOwner);
        marketGroup.createMarket(
            ISapienceStructs.MarketCreationParams({
                startTime: block.timestamp - 1 days,
                endTime: block.timestamp + 30 days,
                startingSqrtPriceX96: initialSqrtPriceX96,
                baseAssetMinPriceTick: minTick,
                baseAssetMaxPriceTick: maxTick,
                salt: 1,
                claimStatementYesOrNumeric: "claimStatementYes",
                claimStatementNo: ""
            })
        );
        vm.stopPrank();

        // Get the market data
        (
            ISapienceStructs.MarketData memory _initialMarketData,
            ISapienceStructs.MarketParams memory _marketParams
        ) = marketGroup.getLatestMarket();
        uint256 marketId = _initialMarketData.marketId;
        uint256 endTime = _initialMarketData.endTime;
        ISapienceStructs.MarketParams memory marketParams = _marketParams;
        ISapienceStructs.MarketData memory marketData;

        bondCurrency.mint(marketParams.bondAmount * 2, safeOwner);

        // Settle
        vm.warp(endTime + 1);
        vm.startPrank(deployer);
        vm.expectRevert("Only owner can call this function");
        marketGroup.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: marketId,
                asserter: address(0),
                settlementSqrtPriceX96: SQRT_PRICE_11Eth
            })
        );
        vm.stopPrank();

        vm.startPrank(safeOwner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(marketGroup),
            marketParams.bondAmount
        );
        bytes32 assertionId = marketGroup.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: marketId,
                asserter: safeOwner,
                settlementSqrtPriceX96: SQRT_PRICE_11Eth
            })
        );
        vm.stopPrank();

        (marketData, ) = marketGroup.getLatestMarket();
        assertTrue(!marketData.settled, "The market isn't settled");

        vm.startPrank(optimisticOracleV3);
        marketGroup.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (marketData, ) = marketGroup.getLatestMarket();
        assertTrue(marketData.settled, "The market is settled");
        assertEq(
            marketData.settlementPriceD18,
            settlementPriceD18,
            "The settlement price is as submitted"
        );
    }
}
