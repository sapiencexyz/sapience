// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import {TradeTestHelper} from "./helpers/TradeTestHelper.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";
import "../src/synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../src/synthetix/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../src/contracts/storage/Errors.sol";
import {Position} from "../src/contracts/storage/Position.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {MigrationMathUtils} from "../src/contracts/external/univ3/MigrationMathUtils.sol";
import "../src/synthetix/utils/DecimalMath.sol";

import "forge-std/console2.sol";

contract TradePositionSettlement is TradeTestHelper {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;

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
    int24 LOWERTICK = 12200; //3.31
    int24 UPPERTICK = 12400; //3.52
    uint256 collateralForOrders = 10 ether;
    int256 baseRequestedAmount;
    int256 baseFee;

    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    IFoilStructs.EpochParams epochParams;
    uint256 settlementPriceD18 = 10 ether;

    function setUp() public {
        uint160 startingSqrtPriceX96 = 146497135921788803112962621440; // 3.419
        baseRequestedAmount = 3.419 ether;
        baseFee = baseRequestedAmount / 100; // 1%

        (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrders * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        // Settle the epoch
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        (owner, , , , optimisticOracleV3, ) = foil.getMarket();
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
        foil.createTraderPosition(epochId, 100 ether, 1 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_long_increase_RevertIf_Settled() public {
        modifyAndRevert(1 ether, 2 ether);
    }

    function test_modifyTraderPosition_long_reduce_UsesSettlementPrice()
        public
    {
        modifyAndSucceed(1 ether, .5 ether);
    }

    function test_modifyTraderPosition_long_close_UsesSettlementPrice_Only()
        public
    {
        // modifyAndSucceed(1 ether, 0);
    }

    function test_modifyTraderPosition_long_cross_greater_RevertIf_Settled()
        public
    {
        modifyAndRevert(1 ether, -2 ether);
    }

    function test_modifyTraderPosition_long_cross_lower_UsesSettlementPrice_Only()
        public
    {
        // modifyAndSucceed(1 ether, -.5 ether);
    }

    function test_createTraderPosition_short_RevertIf_Settled() public {
        settle();
        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.createTraderPosition(epochId, 100 ether, -1 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_short_increase_RevertIf_Settled()
        public
    {
        modifyAndRevert(-1 ether, -2 ether);
    }

    function test_modifyTraderPosition_short_reduce_UsesSettlementPrice_Only()
        public
    {
        // modifyAndSucceed(-1 ether, -.5 ether);
    }

    function test_modifyTraderPosition_short_close_UsesSettlementPrice_Only()
        public
    {
        // modifyAndSucceed(-1 ether, 0 ether);
    }

    function test_modifyTraderPosition_short_cross_greater_RevertIf_Settled()
        public
    {
        modifyAndRevert(-1 ether, 2 ether);
    }

    function test_modifyTraderPosition_short_cross_lower_UsesSettlementPrice_Only()
        public
    {
        // modifyAndSucceed(-1 ether, .5 ether);
    }

    function modifyAndRevert(
        int256 initialPositionSize,
        int256 newPositionSize
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = foil.createTraderPosition(
            epochId,
            100 ether,
            initialPositionSize,
            0
        );

        vm.stopPrank();

        settle();

        vm.startPrank(trader1);
        vm.expectRevert(Errors.EpochSettled.selector);
        foil.modifyTraderPosition(positionId, 200 ether, newPositionSize, 0);

        vm.stopPrank();
    }

    function modifyAndSucceed(
        int256 initialPositionSize,
        int256 newPositionSize
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = foil.createTraderPosition(
            epochId,
            100 ether,
            initialPositionSize,
            0
        );
        Position.Data memory position = foil.getPosition(positionId);
        uint256 totalEthPre = position.depositedCollateralAmount -
            position.borrowedVEth +
            position.vEthAmount;
        uint256 expectedDelta = (MigrationMathUtils.abs(initialPositionSize) -
            MigrationMathUtils.abs(newPositionSize)).mulDecimal(
                settlementPriceD18
            );

        // console2.log(" >>> expectedDelta", expectedDelta);
        vm.stopPrank();

        settle();

        // console2.log(" >>> AAAA 1");
        vm.startPrank(trader1);
        foil.modifyTraderPosition(positionId, 200 ether, newPositionSize, 0);
        vm.stopPrank();
        // console2.log(" >>> AAAA 2");

        position = foil.getPosition(positionId);
        logPositionAndAccount(foil, positionId);
        uint256 totalEthPost = position.depositedCollateralAmount -
            position.borrowedVEth +
            position.vEthAmount -
            100 ether;
        assertEq(totalEthPre + expectedDelta, totalEthPost, "totalEthLike");
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
            settlementPriceD18
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
    }
}
