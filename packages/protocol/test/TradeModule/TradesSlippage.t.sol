// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";

import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TradePositionSlippage is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    // helper struct
    struct StateData {
        uint256 userCollateral;
        uint256 foilCollateral;
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 positionSize;
        uint256 depositedCollateralAmount;
    }

    IFoil foil;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    int24 EPOCH_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 EPOCH_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 16000;
    int24 LP_UPPER_TICK = 29800;
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;

    int256 SLIPPAGE_MULTIPLIER_INCREASE = 1.02 ether;
    int256 SLIPPAGE_MULTIPLIER_DECREASE = 0.98 ether;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (foil, ) = createEpoch(
            EPOCH_LOWER_TICK,
            EPOCH_UPPER_TICK,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE
        );

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (
            IFoilStructs.EpochData memory epochData,
        ) = foil.getLatestEpoch();
        epochId = epochData.epochId;
        pool = epochData.pool;
        tokenA = epochData.ethToken;
        tokenB = epochData.gasToken;

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        // Add liquidity
        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            COLLATERAL_FOR_ORDERS * 10_000_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_revertIfCollateralLimitIsReached_create_long() public {
        int256 positionSize = 1 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), positionSize);
    }

    function test_revertIfCollateralLimitIsReached_create_short() public {
        int256 positionSize = -1 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), positionSize);
    }

    function test_revertIfCollateralLimitIsReached_increase_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 2 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_decrease_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = .5 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_DECREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_increase_short() public {
        int256 positionSize = -1 ether;
        int256 updatedPositionSize = -2 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_decrease_short() public {
        int256 positionSize = -1 ether;
        int256 updatedPositionSize = -.5 ether;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_DECREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_close_long() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 0;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_DECREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }

    function test_revertIfCollateralLimitIsReached_close_short() public {
        int256 positionSize = 1 ether;
        int256 updatedPositionSize = 0;
        vm.startPrank(trader1);

        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral.mulDecimal(
                SLIPPAGE_MULTIPLIER_INCREASE.toUint()
            ),
            block.timestamp + 30 minutes
        );

        (int256 requiredCollateralForUpdate, , ) = foil
            .quoteModifyTraderPosition(positionId, updatedPositionSize);

        // Expect revert
        vm.expectPartialRevert(Errors.CollateralLimitReached.selector);
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate - 100,
            block.timestamp + 30 minutes
        );

        // Now attempt to create the position without reverting
        foil.modifyTraderPosition(
            positionId,
            updatedPositionSize,
            requiredCollateralForUpdate.mulDecimal(
                SLIPPAGE_MULTIPLIER_DECREASE
            ),
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        assertEq(foil.getPositionSize(positionId), updatedPositionSize);
    }
}
