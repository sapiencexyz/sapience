// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {SettlementModule} from "../../src/market/modules/SettlementModule.sol";
import {TradeModule} from "../../src/market/modules/TradeModule.sol";
import {Market} from "../../src/market/storage/Market.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {Epoch} from "../../src/market/storage/Epoch.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IMockVault} from "../../src/market/interfaces/mocks/IMockVault.sol";

contract SettleLPTest is TestTrade {
    using Cannon for Vm;

    IFoil public foil;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    address lp1;
    address trader1;
    address trader2;
    address owner;
    uint256 lpPositionId;
    uint256 longPositionId;
    uint256 shortPositionId;
    IMintableToken collateralAsset;
    int24 constant MIN_TICK = 16000;
    int24 constant MAX_TICK = 29800;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 constant MIN_COLLATERAL = 10_000; // 10,000 wstETH;
    uint256 constant settlementPrice = 10 ether;
    uint160 constant settlementPriceSqrt = 250541448375047946302209916928;
    uint256 constant BOND_AMOUNT = 5 ether;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        // Create users
        lp1 = createUser("lp", 1000 ether);
        trader1 = createUser("trader1", 1000 ether);
        trader2 = createUser("trader2", 1000 ether);

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, owner) = createEpochWithCallback(
            MIN_TICK,
            MAX_TICK,
            startingSqrtPriceX96,
            vm.getAddress("MockVault"),
            MIN_TRADE_SIZE,
            MIN_COLLATERAL
        );

        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        epochId = epochData.epochId;
        pool = epochData.pool;
        tokenA = epochData.ethToken;
        tokenB = epochData.gasToken;

        // Create LP position
        provideLiquidity(lp1, 100 ether);
        longPositionId = traderBuysGas(trader1, 5 ether);
        shortPositionId = traderSellsGas(trader2, 15 ether);
    }

    function provideLiquidity(address user, uint256 collateralAmount) internal {
        // Get token amounts for collateral using TestEpoch's method
        (
            uint256 gasTokenAmount,
            uint256 ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                MIN_TICK,
                MAX_TICK
            );

        // Create initial position
        vm.startPrank(user);
        (lpPositionId, , , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: collateralAmount + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            })
        );
        vm.stopPrank();
    }

    function traderBuysGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        vm.startPrank(trader);
        traderPositionId = addTraderPosition(foil, epochId, int256(amount));
        vm.stopPrank();
    }

    function traderSellsGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        vm.startPrank(trader);
        traderPositionId = addTraderPosition(foil, epochId, -int256(amount));
        vm.stopPrank();
    }

    function test_revertWhen_invalidPositionId() public {
        uint256 invalidPositionId = 999; // An ID that doesn't exist
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidPositionId.selector,
                invalidPositionId
            )
        );
        vm.prank(lp1);
        foil.settlePosition(invalidPositionId);
    }

    function test_revertWhen_notOwner() public {
        address randomUser = address(0x1234);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.NotAccountOwner.selector,
                lpPositionId,
                randomUser
            )
        );
        vm.prank(randomUser);
        foil.settlePosition(lpPositionId);
    }

    function test_revertWhen_epochNotSettled() public {
        vm.expectRevert(
            abi.encodeWithSelector(Errors.EpochNotSettled.selector, epochId)
        );
        vm.prank(lp1);
        foil.settlePosition(lpPositionId);
    }

    function test_settleLp() public {
        // Warp to end of epoch
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        vm.warp(epochData.endTime + 1);

        // Set settlement price
        settleEpoch(epochId, settlementPriceSqrt, owner);

        // Settle LP position
        vm.prank(lp1);
        foil.settlePosition(lpPositionId);

        // Assert position is settled
        Position.Data memory updatedPosition = foil.getPosition(lpPositionId);
        bool isSettled = updatedPosition.isSettled;
        assertTrue(isSettled, "Position should be settled");

        assertEq(
            IMockVault(vm.getAddress("MockVault")).getLastSettlementPrice(),
            settlementPriceSqrt
        );

        // TODO: fix this, need to calculate tokens that were collected which is a bit tricky
        // assertCollateralBalanceAfterSettlement(
        //     initialCollateralBalance,
        //     position
        // );
    }

    struct SettlementCollateralAssertionData {
        uint256 amount0;
        uint256 amount1;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        uint128 liquidity;
        uint256 totalOwed0;
        uint256 totalOwed1;
        uint256 owned0InCollateral;
        uint256 owned1InCollateral;
        uint256 loan0InCollateral;
        uint256 loan1InCollateral;
        uint256 expectedCollateralReturned;
    }

    // function assertCollateralBalanceAfterSettlement(
    //     uint256 initialCollateralBalance,
    //     Position.Data memory position
    // ) internal {
    //     SettlementCollateralAssertionData memory data;
    //     // Get the current position token amounts
    //     (
    //         data.amount0,
    //         data.amount1,
    //         data.tokensOwed0,
    //         data.tokensOwed1,
    //         data.liquidity
    //     ) = getCurrentPositionTokenAmounts(
    //         position.uniswapPositionId,
    //         MIN_TICK,
    //         MAX_TICK
    //     );

    //     // Calculate total owed tokens
    //     data.totalOwed0 = data.amount0 + data.tokensOwed0;
    //     data.totalOwed1 = data.amount1 + data.tokensOwed1;

    //     // Convert owed tokens to collateral asset
    //     data.owned0InCollateral = (data.totalOwed0 * settlementPrice) / 1e18;
    //     data.owned1InCollateral = data.totalOwed1;

    //     data.loan0InCollateral =
    //         (position.borrowedVGas * settlementPrice) /
    //         1e18;
    //     data.loan1InCollateral = position.borrowedVEth;

    //     // Calculate expected collateral balance after settlement
    //     data.expectedCollateralReturned =
    //         position.depositedCollateralAmount +
    //         data.owned0InCollateral +
    //         data.owned1InCollateral -
    //         data.loan0InCollateral -
    //         data.loan1InCollateral;

    //     // Log all relevant data for debugging and verification
    //     console.log("Tokens Owed0:", data.tokensOwed0);
    //     console.log("Tokens Owed1:", data.tokensOwed1);
    //     console.log("Total Owed0:", data.totalOwed0);
    //     console.log("Total Owed1:", data.totalOwed1);
    //     console.log("Owned0 In Collateral:", data.owned0InCollateral);
    //     console.log("Owned1 In Collateral:", data.owned1InCollateral);
    //     console.log("Loan0 In Collateral:", data.loan0InCollateral);
    //     console.log("Loan1 In Collateral:", data.loan1InCollateral);
    //     console.log(
    //         "Expected Collateral Returned:",
    //         data.expectedCollateralReturned
    //     );

    //     // Assert that the actual collateral balance matches the expected balance
    //     assertEq(
    //         collateralAsset.balanceOf(lp1),
    //         initialCollateralBalance + data.expectedCollateralReturned,
    //         "Collateral balance after settlement does not match expected value"
    //     );
    // }
}
