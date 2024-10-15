// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {Epoch} from "../../src/contracts/storage/Epoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ILiquidityModule} from "../../src/contracts/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

contract DecreaseLiquidityPosition is TestTrade {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken collateralAsset;

    address lp1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant INITIAL_LP_BALANCE = 100_000_000 ether;
    uint256 constant INITIAL_COLLATERAL_AMOUNT = 100 ether;
    uint256 positionId;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, ) = createEpoch(MIN_TICK, MAX_TICK, startingSqrtPriceX96);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        // Get token amounts for collateral using TestEpoch's method
        (
            uint256 gasTokenAmount,
            uint256 ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
                INITIAL_COLLATERAL_AMOUNT,
                MIN_TICK,
                MAX_TICK
            );

        // Create initial position
        vm.startPrank(lp1);
        (positionId, , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: INITIAL_COLLATERAL_AMOUNT + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_revertWhen_decreasingPositionWithInvalidId() public {
        uint256 invalidPositionId = 999; // An ID that doesn't exist

        vm.startPrank(lp1);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidPositionId.selector,
                invalidPositionId
            )
        );
        foil.decreaseLiquidityPosition(
            IFoilStructs.LiquidityDecreaseParams({
                positionId: invalidPositionId,
                liquidity: 500,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_revertWhen_decreasingPositionAfterEpochSettlement() public {
        // Settle the epoch
        (, , uint256 endTime, , , , , , , , ) = foil.getLatestEpoch();
        vm.warp(endTime + 1);

        // Try to decrease position after settlement
        vm.expectRevert(Errors.ExpiredEpoch.selector);
        vm.prank(lp1);
        foil.decreaseLiquidityPosition(
            IFoilStructs.LiquidityDecreaseParams({
                positionId: positionId,
                liquidity: 500,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function traderSellsGas() public {
        // Create a trader position before each test
        address trader = createUser("Trader", 1000 ether);
        vm.startPrank(trader);

        // TODO notice this is a long position, not short => is buying bas
        addTraderPosition(foil, epochId, 1 ether);

        vm.stopPrank();
    }

    struct InitialValues {
        uint256 initialGasTokenAmount;
        uint256 initialEthTokenAmount;
        uint256 initialOwedTokens0;
        uint256 initialOwedTokens1;
        uint128 initialLiquidity;
        uint256 initialLpBalance;
        uint256 initialFoilBalance;
    }

    function test_decreaseLiquidityPosition() public {
        // Get the initial position data
        Position.Data memory initialPosition = foil.getPosition(positionId);

        InitialValues memory initialValues;
        (
            initialValues.initialGasTokenAmount,
            initialValues.initialEthTokenAmount,
            ,
            ,
            initialValues.initialLiquidity
        ) = getCurrentPositionTokenAmounts(
            initialPosition.uniswapPositionId,
            MIN_TICK,
            MAX_TICK
        );

        // Calculate 30% of the initial liquidity
        uint128 liquidityToDecrease = uint128(
            (initialValues.initialLiquidity * 30) / 100
        );

        vm.startPrank(lp1);

        // Check initial balances
        initialValues.initialLpBalance = collateralAsset.balanceOf(lp1);
        initialValues.initialFoilBalance = collateralAsset.balanceOf(
            address(foil)
        );

        (uint256 amount0, uint256 amount1, uint256 newCollateralAmount) = foil
            .decreaseLiquidityPosition(
                IFoilStructs.LiquidityDecreaseParams({
                    positionId: positionId,
                    liquidity: liquidityToDecrease,
                    minGasAmount: 0,
                    minEthAmount: 0,
                    deadline: block.timestamp + 30 minutes
                })
            );

        // Get the updated position data
        Position.Data memory updatedPosition = foil.getPosition(positionId);

        // Assert that the proper collateral amount was returned to lp
        assertEq(
            collateralAsset.balanceOf(lp1),
            initialValues.initialLpBalance +
                (initialPosition.depositedCollateralAmount -
                    newCollateralAmount),
            "Incorrect amount of collateral returned to LP"
        );

        // Assert that the proper collateral amount was reduced from foil balance
        assertEq(
            collateralAsset.balanceOf(address(foil)),
            initialValues.initialFoilBalance -
                (initialPosition.depositedCollateralAmount -
                    newCollateralAmount),
            "Incorrect amount of collateral reduced from Foil balance"
        );

        // Check that owed tokens have increased correctly
        (
            ,
            ,
            uint256 newTokensOwed0,
            uint256 newTokensOwed1,

        ) = getCurrentPositionTokenAmounts(
                updatedPosition.uniswapPositionId,
                MIN_TICK,
                MAX_TICK
            );

        assertEq(
            newTokensOwed0,
            amount0,
            "Owed token0 should increase by 30% of removed amount"
        );
        assertEq(
            newTokensOwed1,
            amount1,
            "Owed token1 should increase by 30% of removed amount"
        );

        // Assertions
        assertGt(
            amount0,
            0,
            "Amount of token0 removed should be greater than 0"
        );
        assertGt(
            amount1,
            0,
            "Amount of token1 removed should be greater than 0"
        );

        assertEq(
            updatedPosition.depositedCollateralAmount,
            newCollateralAmount,
            "Collateral amount should be decreased to 70% of initial amount"
        );

        vm.stopPrank();
    }

    function increaseLiquidityPosition() internal {
        traderSellsGas();

        vm.startPrank(lp1);

        // Get initial position details
        (
            uint256 initialAmount0,
            uint256 initialAmount1,
            ,
            ,
            uint128 initialLiquidity
        ) = getCurrentPositionTokenAmounts(positionId, MIN_TICK, MAX_TICK);
        initialLiquidity;

        // Calculate amounts to increase
        uint256 increaseAmount0 = initialAmount0 / 2; // Increase by 50%
        uint256 increaseAmount1 = initialAmount1 / 2; // Increase by 50%

        // Increase the liquidity position
        foil.increaseLiquidityPosition(
            IFoilStructs.LiquidityIncreaseParams({
                positionId: positionId,
                collateralAmount: 1000 ether,
                gasTokenAmount: increaseAmount0,
                ethTokenAmount: increaseAmount1,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_decreaseLiquidityPosition_closePosition() public {
        traderSellsGas();
        increaseLiquidityPosition(); // this collects fees from trader

        vm.startPrank(lp1);

        Position.Data memory initialPosition = foil.getPosition(positionId);

        // Get initial position details
        (
            uint256 initialAmount0,
            uint256 initialAmount1,
            uint256 initialOwedTokens0,
            uint256 initialOwedTokens1,
            uint128 initialLiquidity
        ) = getCurrentPositionTokenAmounts(
                initialPosition.uniswapPositionId,
                MIN_TICK,
                MAX_TICK
            );

        // Close the position
        (uint256 amount0, uint256 amount1, uint256 collateralAmount) = foil
            .decreaseLiquidityPosition(
                IFoilStructs.LiquidityDecreaseParams({
                    positionId: positionId,
                    liquidity: initialLiquidity,
                    minGasAmount: 0,
                    minEthAmount: 0,
                    deadline: block.timestamp + 30 minutes
                })
            );

        collateralAmount;

        // Get updated position
        Position.Data memory updatedPosition = foil.getPosition(positionId);

        assertEq(
            updatedPosition.uniswapPositionId,
            0,
            "Uniswap position ID should be 0"
        );
        int256 vEthLoan = int256(initialPosition.borrowedVEth) -
            int256(amount1);
        assertEq(
            updatedPosition.depositedCollateralAmount,
            uint256(
                int256(initialPosition.depositedCollateralAmount) - vEthLoan
            ),
            "Deposited collateral amount shouldn't change"
        );
        assertEq(updatedPosition.borrowedVEth, 0, "Borrowed vEth should be 0");

        if (amount0 + initialOwedTokens0 > initialPosition.borrowedVGas) {
            assertEq(
                updatedPosition.vGasAmount,
                initialPosition.borrowedVGas - (initialOwedTokens0 + amount0),
                "vGas amount should be equal to borrowed vGas minus owed tokens and decreased amount"
            );
        } else {
            assertEq(
                updatedPosition.borrowedVGas,
                initialPosition.borrowedVGas - (initialOwedTokens0 + amount0),
                "vGas amount should be equal to borrowed vGas minus owed tokens and decreased amount"
            );
        }

        // Notice +/- 1 due to rounding errors
        assertApproxEqAbs(
            amount0,
            initialAmount0 + initialOwedTokens0,
            1,
            "All token0 should be collected"
        );
        assertApproxEqAbs(
            amount1,
            initialAmount1 + initialOwedTokens1,
            1,
            "All token1 should be collected"
        );

        // Check that the Uniswap position is burned
        // vm.expectRevert("Invalid token ID");
        // uniswapV3PositionManager.positions(initialPosition.uniswapPositionId);

        vm.stopPrank();
    }
}
