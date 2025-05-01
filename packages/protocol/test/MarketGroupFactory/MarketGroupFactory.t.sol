// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";

import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {IResolutionCallback} from "../../src/vault/interfaces/IResolutionCallback.sol";
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
    IFoil foil;
    IVault vault;
    MarketGroupFactory marketGroupFactory;
    IMintableToken collateralAsset;
    IMintableToken bondCurrency;

    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 constant BOND_AMOUNT = 100 ether;
    address[] feeCollectors = new address[](0);
    address callbackRecipient = address(0);
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

    function test_canCloneMarketGroup_Only() public {
        vm.startPrank(deployer);
        (address marketGroup, ) = marketGroupFactory
            .cloneAndInitializeMarketGroup(
                safeOwner,
                address(collateralAsset),
                feeCollectors,
                callbackRecipient,
                MIN_TRADE_SIZE,
                IFoilStructs.MarketParams({
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
        checkMarketGroupCanOperate(IFoil(marketGroup));
    }

    function test_revertsWhenCloneNonDeployerSetAddress() public {
        vm.startPrank(safeOwner);
        vm.expectRevert("Only authorized owner can call this function");
        marketGroupFactory.cloneAndInitializeMarketGroup(
            safeOwner,
            address(collateralAsset),
            feeCollectors,
            callbackRecipient,
            MIN_TRADE_SIZE,
            IFoilStructs.MarketParams({
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
    }

    function test_revertsAndPropagatesTheError_feeRateZero() public {
        vm.startPrank(deployer);
        // vm.expectRevert("InvalidFeeRate(0)");
        vm.expectRevert();
        marketGroupFactory.cloneAndInitializeMarketGroup(
            safeOwner,
            address(collateralAsset),
            feeCollectors,
            callbackRecipient,
            MIN_TRADE_SIZE,
            IFoilStructs.MarketParams({
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

    function checkMarketGroupCanOperate(IFoil marketGroup) private {
        uint160 SQRT_PRICE_11Eth = 262770087889115504578498920448;
        uint256 settlementPriceD18 = 10999999999999999740;
        uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
        int24 minTick = 6800; // 2.0
        int24 maxTick = 27000; // 15.0

        // Initialize the market (again)
        vm.startPrank(deployer);
        marketGroup.initializeMarket(
            safeOwner,
            address(collateralAsset),
            feeCollectors,
            callbackRecipient,
            MIN_TRADE_SIZE,
            IFoilStructs.MarketParams({
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

        // Create a new epoch
        vm.startPrank(safeOwner);
        marketGroup.createEpoch(
            block.timestamp - 1 days,
            block.timestamp + 30 days,
            initialSqrtPriceX96,
            minTick,
            maxTick,
            1,
            "claimStatement"
        );
        vm.stopPrank();

        // Get the epoch data
        (
            IFoilStructs.EpochData memory _initialEpochData,
            IFoilStructs.MarketParams memory _epochParams
        ) = marketGroup.getLatestEpoch();
        uint256 epochId = _initialEpochData.epochId;
        uint256 endTime = _initialEpochData.endTime;
        IFoilStructs.MarketParams memory marketParams = _epochParams;
        IFoilStructs.EpochData memory epochData;

        bondCurrency.mint(marketParams.bondAmount * 2, safeOwner);

        // Settle
        vm.warp(endTime + 1);
        vm.startPrank(deployer);
        vm.expectRevert("Only owner can call this function");
        marketGroup.submitSettlementPrice(
            epochId,
            address(0),
            SQRT_PRICE_11Eth
        );
        vm.stopPrank();

        vm.startPrank(safeOwner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(marketGroup),
            marketParams.bondAmount
        );
        bytes32 assertionId = marketGroup.submitSettlementPrice(
            epochId,
            safeOwner,
            SQRT_PRICE_11Eth
        );
        vm.stopPrank();

        (epochData, ) = marketGroup.getLatestEpoch();
        assertTrue(!epochData.settled, "The epoch isn't settled");

        vm.startPrank(optimisticOracleV3);
        marketGroup.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (epochData, ) = marketGroup.getLatestEpoch();
        assertTrue(epochData.settled, "The epoch is settled");
        assertEq(
            epochData.settlementPriceD18,
            settlementPriceD18,
            "The settlement price is as submitted"
        );
    }
}
