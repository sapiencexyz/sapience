// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {Position} from "../../src/contracts/storage/Position.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {MigrationMathUtils} from "../../src/contracts/external/univ3/MigrationMathUtils.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract TradePositionSettlement is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    IFoil foil;
    IMintableToken collateralAsset;
    IMintableToken bondCurrency;

    address owner;
    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    uint256 COLLATERAL_FOR_ORDERS = 100 ether;
    uint256 INITIAL_PRICE_D18 = 5 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 5.05 ether;
    uint256 INITIAL_PRICE_LESS_FEE_D18 = 4.95 ether;
    uint160 INITIAL_PRICE_SQRT = 177159557114295718903631839232; // 5.0
    int24 EPOCH_LOWER_TICK = 6800; // 2.0
    int24 EPOCH_UPPER_TICK = 27000; // 15.0
    int24 LP_LOWER_TICK = 15800; //3.31
    int24 LP_UPPER_TICK = 16200; //3.52
    uint256 SETTLEMENT_PRICE_D18 = 10 ether;

    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    IFoilStructs.EpochParams epochParams;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 20_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 20_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            COLLATERAL_FOR_ORDERS * 100_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        // Settle the epoch
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        (owner, , ) = foil.getMarket();
        (
            epochId,
            ,
            endTime,
            ,
            ,
            ,
            minPriceD18,
            maxPriceD18,
            ,
            ,
            epochParams
        ) = foil.getLatestEpoch();

        bondCurrency.mint(epochParams.bondAmount * 2, owner);
    }

    function test_createTraderPosition_long_RevertIf_Settled() public {
        settle();
        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.createTraderPosition(
            epochId,
            1 ether,
            100 ether,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();
    }

    function test_modifyTraderPosition_long_increase_RevertIf_Settled() public {
        modifyAndRevert(1 ether, 2 ether);
    }

    function test_modifyTraderPosition_long_reduce_RevertIf_Settled() public {
        modifyAndRevert(1 ether, .5 ether);
    }

    function test_modifyTraderPosition_long_close_UsesSettlementPrice() public {
        closeAndRevert(1 ether);
    }

    function test_modifyTraderPosition_long_cross_greater_RevertIf_Settled()
        public
    {
        modifyAndRevert(1 ether, -2 ether);
    }

    function test_modifyTraderPosition_long_cross_lower_RevertIf_Settled()
        public
    {
        modifyAndRevert(1 ether, -.5 ether);
    }

    function test_createTraderPosition_short_RevertIf_Settled() public {
        settle();
        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.createTraderPosition(
            epochId,
            -1 ether,
            100 ether,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();
    }

    function test_modifyTraderPosition_short_increase_RevertIf_Settled()
        public
    {
        modifyAndRevert(-1 ether, -2 ether);
    }

    function test_modifyTraderPosition_short_reduce_RevertIf_Settled() public {
        modifyAndRevert(-1 ether, -.5 ether);
    }

    function test_modifyTraderPosition_short_close_UsesSettlementPrice()
        public
    {
        closeAndRevert(-1 ether);
    }

    function test_modifyTraderPosition_short_cross_greater_RevertIf_Settled()
        public
    {
        modifyAndRevert(-1 ether, 2 ether);
    }

    function test_modifyTraderPosition_short_cross_lower_RevertIf_Settled()
        public
    {
        modifyAndRevert(-1 ether, .5 ether);
    }

    function modifyAndRevert(
        int256 initialPositionSize,
        int256 newPositionSize
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = foil.createTraderPosition(
            epochId,
            initialPositionSize,
            100 ether,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        settle();

        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.modifyTraderPosition(
            positionId,
            newPositionSize,
            200 ether,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
    }

    function closeAndRevert(int256 initialPositionSize) internal {
        vm.startPrank(trader1);
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            initialPositionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            initialPositionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        settle();

        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral.toInt(),
            block.timestamp + 30 minutes
        );
        vm.stopPrank();
    }

    function settle() internal {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            SETTLEMENT_PRICE_D18
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
    }
}
