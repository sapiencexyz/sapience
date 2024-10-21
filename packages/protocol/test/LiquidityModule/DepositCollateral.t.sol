// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {ILiquidityModule} from "../../src/contracts/interfaces/ILiquidityModule.sol";
import {Position} from "../../src/contracts/storage/Position.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";

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
            address(0)
        );

        (epochId, , , , , , , , , , ) = foil.getLatestEpoch();

        (
            uint256 gasTokenAmount,
            uint256 ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
                COLLATERAL_AMOUNT,
                LOWER_TICK,
                UPPER_TICK
            );

        // Create fee collector position
        vm.startPrank(feeCollector);
        (feeCollectorPositionId, , , , , ) = foil.createLiquidityPosition(
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
        (regularLpPositionId, , , , , ) = foil.createLiquidityPosition(
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
    }

    function test_depositCollateralAsFeeCollector() public {
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
            amountToDeposit,
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

        vm.startPrank(feeCollector);
        vm.expectEmit(true, true, true, true);
        emit ILiquidityModule.CollateralDeposited(
            feeCollector,
            epochId,
            feeCollectorPositionId,
            amountToDeposit
        );
        foil.depositCollateral(feeCollectorPositionId, amountToDeposit);
        vm.stopPrank();
    }

    function test_depositAdditionalCollateral() public {
        uint256 initialDeposit = 5 ether;
        uint256 additionalDeposit = 3 ether;
        uint256 totalExpectedDeposit = initialDeposit + additionalDeposit;

        // Initial deposit
        vm.startPrank(feeCollector);
        foil.depositCollateral(feeCollectorPositionId, initialDeposit);

        // Get position data after initial deposit
        Position.Data memory positionAfterInitial = foil.getPosition(
            feeCollectorPositionId
        );
        assertEq(
            positionAfterInitial.depositedCollateralAmount,
            initialDeposit,
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
}
