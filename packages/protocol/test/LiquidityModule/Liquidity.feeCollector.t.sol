// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {Epoch} from "../../src/market/storage/Epoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ILiquidityModule} from "../../src/market/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/market/storage/Position.sol";

contract LiquidityFeeCollectorTest is TestTrade {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken collateralAsset;

    address feeCollector;
    address regularLp;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant INITIAL_BALANCE = 100_000_000 ether;
    uint256 constant DUST = 1e5;
    address trader1;
    address trader2;
    uint256 feeCollectorId;
    uint256 regularLpId;

    uint256 constant COLLATERAL_AMOUNT = 10 ether;
    int24 constant LOWER_TICK = 19400;
    int24 constant UPPER_TICK = 24800;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        feeCollector = TestUser.createUser("FeeCollector", 0); // no balance
        regularLp = TestUser.createUser("RegularLP", INITIAL_BALANCE);
        trader1 = TestUser.createUser("Trader1", INITIAL_BALANCE);
        trader2 = TestUser.createUser("Trader2", INITIAL_BALANCE);

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        address[] memory feeCollectors = new address[](1);
        feeCollectors[0] = feeCollector;
        (foil, ) = createEpochWithFeeCollectors(
            MIN_TICK,
            MAX_TICK,
            startingSqrtPriceX96,
            feeCollectors,
            MIN_TRADE_SIZE
        );

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        // create liquidity position
        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                COLLATERAL_AMOUNT,
                LOWER_TICK,
                UPPER_TICK
            );

        // Fee collector opens position
        vm.startPrank(feeCollector);
        (feeCollectorId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: loanAmount0,
                amountTokenB: loanAmount1,
                collateralAmount: 0, // Fee collector doesn't need to provide collateral
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Regular LP opens position
        vm.startPrank(regularLp);
        (regularLpId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: loanAmount0,
                amountTokenB: loanAmount1,
                collateralAmount: COLLATERAL_AMOUNT + DUST,
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_newPosition_feeCollectorNoCollateralRequired() public {
        // Get the position for the fee collector
        Position.Data memory feeCollectorPosition = foil.getPosition(
            feeCollectorId
        );

        // Check that deposited collateral is 0
        assertEq(
            feeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should be 0"
        );

        // Check that loan amounts are greater than 0
        assertTrue(
            feeCollectorPosition.borrowedVGas > 0,
            "Fee collector's borrowed vGas should be greater than 0"
        );
        assertTrue(
            feeCollectorPosition.borrowedVEth > 0,
            "Fee collector's borrowed vEth should be greater than 0"
        );
    }

    function test_feeCollectorDecreaseLiquidity_noCollateralRequired() public {
        // Get the current liquidity for the fee collector's position
        Position.Data memory feeCollectorPosition = foil.getPosition(
            feeCollectorId
        );
        uint256 uniswapNftId = feeCollectorPosition.uniswapPositionId;

        (, , , , uint128 initialLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            MIN_TICK,
            MAX_TICK
        );

        // Calculate the liquidity to decrease (25% of current liquidity)
        uint128 liquidityToDecrease = initialLiquidity / 4;
        vm.startPrank(feeCollector);
        foil.decreaseLiquidityPosition(
            IFoilStructs.LiquidityDecreaseParams({
                positionId: feeCollectorId,
                liquidity: liquidityToDecrease,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get the updated position for the fee collector
        Position.Data memory updatedFeeCollectorPosition = foil.getPosition(
            feeCollectorId
        );

        // Assert that the deposited collateral is still 0
        assertEq(
            updatedFeeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should remain 0 after decreasing liquidity"
        );

        // Assert that the borrowed token amounts are still greater than 0
        assertTrue(
            updatedFeeCollectorPosition.borrowedVGas > 0,
            "Fee collector's borrowed vGas should still be greater than 0 after decreasing liquidity"
        );
        assertTrue(
            updatedFeeCollectorPosition.borrowedVEth > 0,
            "Fee collector's borrowed vEth should still be greater than 0 after decreasing liquidity"
        );
    }

    function test_feeCollectorIncreaseLiquidity_noCollateralRequired() public {
        // Get the current liquidity for the fee collector's position
        Position.Data memory feeCollectorPosition = foil.getPosition(
            feeCollectorId
        );
        uint256 uniswapNftId = feeCollectorPosition.uniswapPositionId;

        (
            uint256 initialGasTokenAmount,
            uint256 initialEthTokenAmount,
            ,
            ,

        ) = getCurrentPositionTokenAmounts(uniswapNftId, MIN_TICK, MAX_TICK);

        // Calculate the token amounts to increase (double the initial amounts)
        uint256 gasTokenAmountToAdd = initialGasTokenAmount * 2;
        uint256 ethTokenAmountToAdd = initialEthTokenAmount * 2;

        vm.startPrank(feeCollector);
        foil.increaseLiquidityPosition(
            IFoilStructs.LiquidityIncreaseParams({
                positionId: feeCollectorId,
                collateralAmount: 0, // No collateral for fee collector
                gasTokenAmount: gasTokenAmountToAdd,
                ethTokenAmount: ethTokenAmountToAdd,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get the updated position for the fee collector
        Position.Data memory updatedFeeCollectorPosition = foil.getPosition(
            feeCollectorId
        );

        // Assert that the deposited collateral is still 0
        assertEq(
            updatedFeeCollectorPosition.depositedCollateralAmount,
            0,
            "Fee collector's deposited collateral should remain 0 after increasing liquidity"
        );

        // Assert that the borrowed token amounts have increased
        assertTrue(
            updatedFeeCollectorPosition.borrowedVGas >
                feeCollectorPosition.borrowedVGas,
            "Fee collector's borrowed vGas should increase after increasing liquidity"
        );
        assertTrue(
            updatedFeeCollectorPosition.borrowedVEth >
                feeCollectorPosition.borrowedVEth,
            "Fee collector's borrowed vEth should increase after increasing liquidity"
        );
    }
}
