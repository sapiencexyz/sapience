// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {Epoch} from "../../src/contracts/storage/Epoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ILiquidityModule} from "../../src/contracts/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

contract CreateLiquidityPosition is TestEpoch {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken collateralAsset;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant dust = 1e8;
    uint256 constant INITIAL_LP_BALANCE = 100_000_000 ether;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        foil = IFoil(vm.getAddress("Foil"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, ) = createEpoch(MIN_TICK, MAX_TICK, startingSqrtPriceX96);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();
    }

    function test_revertWhen_invalidEpoch() public {
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidEpoch.selector));
        vm.startPrank(lp1);
        foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId + 1,
                amountTokenA: 1000,
                amountTokenB: 1000,
                collateralAmount: 10 ether,
                lowerTick: 16000,
                upperTick: 29800,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_tickUnderMin() public {
        int24 lowerTick = 16000 - 200;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidRange.selector,
                lowerTick,
                MIN_TICK
            )
        );
        vm.startPrank(lp1);
        foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: 1000,
                amountTokenB: 1000,
                collateralAmount: 10 ether,
                lowerTick: lowerTick,
                upperTick: MAX_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_tickOverMax() public {
        int24 upperTick = MAX_TICK + 200;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidRange.selector,
                upperTick,
                MAX_TICK
            )
        );
        vm.startPrank(lp1);
        foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: 1000,
                amountTokenB: 1000,
                collateralAmount: 10 ether,
                lowerTick: MIN_TICK,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function test_revertWhen_epochExpired() public {
        // Fast forward to after the epoch end time
        (, uint256 epochEndTime, , , , , , , , ) = foil.getEpoch(epochId);
        vm.warp(epochEndTime + 1);

        vm.expectRevert(Errors.ExpiredEpoch.selector);
        vm.prank(lp1);
        foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: 1000,
                amountTokenB: 1000,
                collateralAmount: 10 ether,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    uint256 constant COLLATERAL_AMOUNT = 100 ether;
    int24 constant LOWER_TICK = 19400;
    int24 constant UPPER_TICK = 24800;

    function test_newPosition_withinRange() public {
        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                COLLATERAL_AMOUNT,
                LOWER_TICK,
                UPPER_TICK
            );

        uint256 foilInitialBalance = collateralAsset.balanceOf(address(foil));
        uint256 lpInitialBalance = collateralAsset.balanceOf(lp1);

        vm.prank(lp1);
        (
            uint256 id,
            uint256 requiredCollateral,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = foil.createLiquidityPosition(
                IFoilStructs.LiquidityMintParams({
                    epochId: epochId,
                    amountTokenA: loanAmount0,
                    amountTokenB: loanAmount1,
                    collateralAmount: COLLATERAL_AMOUNT + dust,
                    lowerTick: LOWER_TICK,
                    upperTick: UPPER_TICK,
                    minAmountTokenA: 0,
                    minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
                })
            );
        id;
        uniswapNftId;
        liquidity;

        uint256 foilFinalBalance = collateralAsset.balanceOf(address(foil));
        uint256 lpFinalBalance = collateralAsset.balanceOf(lp1);

        assertEq(
            foilFinalBalance,
            foilInitialBalance + requiredCollateral,
            "Foil balance should increase by the required collateral amount"
        );
        assertEq(
            lpFinalBalance,
            lpInitialBalance - requiredCollateral,
            "LP balance should decrease by the required collateral amount"
        );

        assertApproxEqAbs(
            addedAmount0,
            loanAmount0,
            dust,
            "Added amount of token A should be within 0.00001 of loan amount"
        );
        assertApproxEqAbs(
            addedAmount1,
            loanAmount1,
            dust,
            "Added amount of token B should be within 0.00001 of loan amount"
        );
    }

    function test_revertWhen_insufficientCollateral() public {
        uint256 collateralAmount = 100 ether;
        int24 lowerTick = 19400;
        int24 upperTick = 24800;
        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                lowerTick,
                upperTick
            );

        // Approve less collateral than required
        uint256 insufficientCollateral = collateralAmount - 1 ether;
        vm.startPrank(lp1);
        collateralAsset.approve(address(foil), insufficientCollateral);

        // Can't check revert message without arguments.  and for argument, we'd need exact value from uniswap
        vm.expectRevert();
        foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: loanAmount0,
                amountTokenB: loanAmount1,
                collateralAmount: insufficientCollateral,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function test_fuzz_newPosition_withinRange(
        int24 lowerTick,
        int24 upperTick,
        uint256 collateralAmount
    ) public {
        // Limit the range of ticks to reduce possibilities
        lowerTick = int24(
            int256(
                bound(
                    uint24(lowerTick),
                    uint24(MIN_TICK),
                    uint24(MAX_TICK - 400)
                )
            )
        );
        upperTick = int24(
            int256(
                bound(
                    uint24(upperTick),
                    uint24(lowerTick + 400),
                    uint24(MAX_TICK)
                )
            )
        );

        // Ensure ticks are multiples of 400 to further reduce possibilities
        lowerTick = lowerTick - (lowerTick % 400);
        upperTick = upperTick - (upperTick % 400);

        // Bound collateral amount between 1 ether and 100 ether, with steps of 1 ether
        collateralAmount = bound(collateralAmount, 1 ether, 100 ether);
        collateralAmount = collateralAmount - (collateralAmount % 1 ether);

        (
            uint256 loanAmount0,
            uint256 loanAmount1,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                lowerTick,
                upperTick
            );

        vm.startPrank(lp1);
        (
            uint256 id,
            uint256 requiredCollateral,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = foil.createLiquidityPosition(
                IFoilStructs.LiquidityMintParams({
                    epochId: epochId,
                    amountTokenA: loanAmount0,
                    amountTokenB: loanAmount1,
                    collateralAmount: collateralAmount + dust,
                    lowerTick: lowerTick,
                    upperTick: upperTick,
                    minAmountTokenA: 0,
                    minAmountTokenB: 0,
                    deadline: block.timestamp + 30 minutes
                })
            );
        vm.stopPrank();

        assertGt(id, 0, "Position ID should be greater than 0");
        assertGt(uniswapNftId, 0, "Uniswap NFT ID should be greater than 0");
        assertGt(liquidity, 0, "Liquidity should be greater than 0");
        assertApproxEqAbs(
            addedAmount0,
            loanAmount0,
            dust,
            "Added amount of token A should be within dust of loan amount"
        );
        assertApproxEqAbs(
            addedAmount1,
            loanAmount1,
            dust,
            "Added amount of token B should be within dust of loan amount"
        );

        // Check if collateral amount was transferred to Foil contract
        uint256 foilCollateralBalance = collateralAsset.balanceOf(
            address(foil)
        );
        assertEq(
            foilCollateralBalance,
            requiredCollateral,
            "Collateral amount should be transferred to Foil contract"
        );

        // Optionally, check if LP's balance decreased by the correct amount
        uint256 lpCollateralBalance = collateralAsset.balanceOf(lp1);
        assertEq(
            lpCollateralBalance,
            INITIAL_LP_BALANCE - requiredCollateral,
            "LP's collateral balance should decrease by the correct amount"
        );

        // Check that the loan amount stored on position is equal to the added amounts
        Position.Data memory position = foil.getPosition(id);
        assertEq(
            position.borrowedVGas,
            addedAmount0,
            "Borrowed vGas should equal added amount of token A"
        );
        assertEq(
            position.borrowedVEth,
            addedAmount1,
            "Borrowed vEth should equal added amount of token B"
        );
    }
}
