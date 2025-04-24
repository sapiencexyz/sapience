// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {ILiquidityModule} from "../../src/market/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {IFoilPositionEvents} from "../../src/market/interfaces/IFoilPositionEvents.sol";

contract DepositCollateralTest is TestTrade {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken collateralAsset;
    address feeCollector;
    address regularLp;
    uint256 epochId;
    uint256 feeCollectorPositionId;
    uint256 regularLpPositionId;

    uint256 constant INITIAL_BALANCE = 100_000_000 ether;
    uint256 constant COLLATERAL_AMOUNT = 10 ether;
    int24 constant LOWER_TICK = 19400;
    int24 constant UPPER_TICK = 24800;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        feeCollector = TestUser.createUser("FeeCollector", INITIAL_BALANCE);
        regularLp = TestUser.createUser("RegularLP", INITIAL_BALANCE);

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        address[] memory feeCollectors = new address[](1);
        feeCollectors[0] = feeCollector;
        (foil, ) = createEpochWithFeeCollectors(
            LOWER_TICK,
            UPPER_TICK,
            startingSqrtPriceX96,
            feeCollectors,
            MIN_TRADE_SIZE,
            "wstGwei/gas"
        );

        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        epochId = epochData.epochId;

        (
            uint256 gasTokenAmount,
            uint256 ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
                50 ether,
                LOWER_TICK,
                UPPER_TICK
            );

        // Create fee collector position
        vm.startPrank(feeCollector);
        (feeCollectorPositionId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: COLLATERAL_AMOUNT,
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 1 hours
            })
        );
        vm.stopPrank();

        // Create regular LP position
        vm.startPrank(regularLp);
        (regularLpPositionId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: 50 ether,
                lowerTick: LOWER_TICK,
                upperTick: UPPER_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 1 hours
            })
        );
        vm.stopPrank();
    }

    function test_depositCollateralAsFeeCollector() public {
        // Get initial position data for fee collector
        Position.Data memory initialPosition = foil.getPosition(
            feeCollectorPositionId
        );
        assertEq(
            initialPosition.depositedCollateralAmount,
            COLLATERAL_AMOUNT,
            "Initial collateral amount should be COLLATERAL_AMOUNT"
        );
        uint256 amountToDeposit = 5 ether;

        vm.startPrank(feeCollector);
        foil.depositCollateral(feeCollectorPositionId, amountToDeposit);
        vm.stopPrank();

        // Get the updated position data for the fee collector
        Position.Data memory position = foil.getPosition(
            feeCollectorPositionId
        );
        assertEq(
            position.depositedCollateralAmount,
            amountToDeposit + COLLATERAL_AMOUNT,
            "Collateral amount should increase"
        );
    }

    function test_revertWhen_depositCollateralAsRegularLp() public {
        uint256 additionalCollateral = 5 ether;

        vm.startPrank(regularLp);
        vm.expectRevert(Errors.OnlyFeeCollector.selector);
        foil.depositCollateral(regularLpPositionId, additionalCollateral);
        vm.stopPrank();
    }

    function test_revertWhen_depositCollateralToNonExistentPosition() public {
        uint256 additionalCollateral = 5 ether;
        uint256 nonExistentPositionId = 999999;

        vm.startPrank(feeCollector);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidPositionId.selector,
                nonExistentPositionId
            )
        );
        foil.depositCollateral(nonExistentPositionId, additionalCollateral);
        vm.stopPrank();
    }

    function test_depositCollateralEmitsEvent() public {
        uint256 amountToDeposit = 5 ether;

        // Get position data
        Position.Data memory position = foil.getPosition(
            feeCollectorPositionId
        );

        vm.startPrank(feeCollector);
        vm.expectEmit(true, true, true, true);
        emit IFoilPositionEvents.CollateralDeposited(
            feeCollector,
            epochId,
            feeCollectorPositionId,
            amountToDeposit + COLLATERAL_AMOUNT,
            position.vEthAmount,
            position.vGasAmount,
            position.borrowedVEth,
            position.borrowedVGas,
            int256(amountToDeposit)
        );
        foil.depositCollateral(feeCollectorPositionId, amountToDeposit);
        vm.stopPrank();
    }

    function test_depositAdditionalCollateral() public {
        uint256 initialDeposit = 5 ether;
        uint256 additionalDeposit = 3 ether;
        uint256 totalExpectedDeposit = initialDeposit +
            additionalDeposit +
            COLLATERAL_AMOUNT;

        // Initial deposit
        vm.startPrank(feeCollector);
        foil.depositCollateral(feeCollectorPositionId, initialDeposit);

        // Get position data after initial deposit
        Position.Data memory positionAfterInitial = foil.getPosition(
            feeCollectorPositionId
        );
        assertEq(
            positionAfterInitial.depositedCollateralAmount,
            initialDeposit + COLLATERAL_AMOUNT,
            "Initial deposit should be correct"
        );

        // Additional deposit
        foil.depositCollateral(feeCollectorPositionId, additionalDeposit);
        vm.stopPrank();

        // Get updated position data
        Position.Data memory positionAfterAdditional = foil.getPosition(
            feeCollectorPositionId
        );

        // Check that the total deposited collateral is correct
        assertEq(
            positionAfterAdditional.depositedCollateralAmount,
            totalExpectedDeposit,
            "Total deposited collateral should be the sum of initial and additional deposits"
        );
    }

    function test_increaseLiquidityNoAdditionalCollateral() public {
        vm.startPrank(feeCollector);
        // Get position data and current token amounts
        Position.Data memory positionBefore = foil.getPosition(
            feeCollectorPositionId
        );
        uint256 uniswapNftId = positionBefore.uniswapPositionId;
        (
            uint256 initialGasTokenAmount,
            uint256 initialEthTokenAmount,
            ,
            ,

        ) = getCurrentPositionTokenAmounts(
                uniswapNftId,
                LOWER_TICK,
                UPPER_TICK
            );

        uint256 additionalCollateral = 2;
        // Increase liquidity with no additional collateral
        foil.increaseLiquidityPosition(
            IFoilStructs.LiquidityIncreaseParams({
                positionId: feeCollectorPositionId,
                collateralAmount: additionalCollateral,
                gasTokenAmount: initialGasTokenAmount * 2,
                ethTokenAmount: initialEthTokenAmount * 2,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get updated position data
        Position.Data memory positionAfter = foil.getPosition(
            feeCollectorPositionId
        );

        // Check that deposited collateral amount hasn't changed
        assertEq(
            positionAfter.depositedCollateralAmount,
            COLLATERAL_AMOUNT + additionalCollateral,
            "Deposited collateral should include only the additional collateral + the original"
        );
    }

    function test_decreaseLiquidityNoCollateralChange() public {
        vm.startPrank(feeCollector);
        // Get position data and current token amounts
        Position.Data memory positionBefore = foil.getPosition(
            feeCollectorPositionId
        );
        uint256 uniswapNftId = positionBefore.uniswapPositionId;
        (, , , , uint128 initialLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            LOWER_TICK,
            UPPER_TICK
        );

        // Calculate 20% of initial liquidity to decrease
        uint128 liquidityToDecrease = uint128((initialLiquidity * 20) / 100);

        // Decrease liquidity by 20%
        foil.decreaseLiquidityPosition(
            IFoilStructs.LiquidityDecreaseParams({
                positionId: feeCollectorPositionId,
                liquidity: liquidityToDecrease,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get updated position data
        Position.Data memory positionAfter = foil.getPosition(
            feeCollectorPositionId
        );

        // Check that deposited collateral amount hasn't changed
        assertEq(
            positionAfter.depositedCollateralAmount,
            positionBefore.depositedCollateralAmount,
            "Deposited collateral should remain unchanged after decreasing liquidity"
        );

        // Verify liquidity decreased by ~20%
        (, , , , uint128 remainingLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            LOWER_TICK,
            UPPER_TICK
        );

        assertApproxEqRel(
            remainingLiquidity,
            initialLiquidity - liquidityToDecrease,
            1e16, // 1% tolerance
            "Liquidity should decrease by approximately 20%"
        );
    }

    function test_decreaseLiquidity95Percent() public {
        // Get initial position data
        Position.Data memory positionBefore = foil.getPosition(
            feeCollectorPositionId
        );
        uint256 uniswapNftId = positionBefore.uniswapPositionId;
        (, , , , uint128 initialLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            LOWER_TICK,
            UPPER_TICK
        );

        // Calculate 95% of initial liquidity to decrease
        uint128 liquidityToDecrease = uint128((initialLiquidity * 95) / 100);

        vm.startPrank(feeCollector);
        // Decrease liquidity by 95%
        foil.decreaseLiquidityPosition(
            IFoilStructs.LiquidityDecreaseParams({
                positionId: feeCollectorPositionId,
                liquidity: liquidityToDecrease,
                minGasAmount: 0,
                minEthAmount: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();

        // Get updated position data
        Position.Data memory positionAfter = foil.getPosition(
            feeCollectorPositionId
        );

        // Check that deposited collateral amount is reduced proportionally
        assertApproxEqRel(
            positionAfter.depositedCollateralAmount,
            (50 ether * 5) / 100, // Should be ~5% of original
            1e16, // 1% tolerance
            "Deposited collateral should be reduced to ~5% after decreasing liquidity by 95%"
        );

        // Verify liquidity decreased by ~95%
        (, , , , uint128 remainingLiquidity) = getCurrentPositionTokenAmounts(
            uniswapNftId,
            LOWER_TICK,
            UPPER_TICK
        );

        assertApproxEqRel(
            remainingLiquidity,
            initialLiquidity - liquidityToDecrease,
            1e16, // 1% tolerance
            "Liquidity should decrease by approximately 95%"
        );
    }
}
