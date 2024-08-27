// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {EpochSettlementModule} from "../../src/contracts/modules/EpochSettlementModule.sol";
import {EpochTradeModule} from "../../src/contracts/modules/EpochTradeModule.sol";
import {Market} from "../../src/contracts/storage/Market.sol";
import {Position} from "../../src/contracts/storage/Position.sol";
import {Epoch} from "../../src/contracts/storage/Epoch.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
contract SettleLPTest is TestEpoch {
    using Cannon for Vm;

    IFoil public foil;
    EpochSettlementModule public epochSettlementModule;
    EpochTradeModule public epochTradeModule;
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
    uint256 constant dust = 1e8;
    uint256 constant settlementPrice = 15 ether;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        // Create users
        lp1 = createUser("lp", 1000 ether);
        trader1 = createUser("trader1", 1000 ether);
        trader2 = createUser("trader2", 1000 ether);

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, owner) = createEpoch(MIN_TICK, MAX_TICK, startingSqrtPriceX96);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        // Create LP position
        console2.log("lp");
        provideLiquidity(lp1, 100 ether);
        console2.log("trader1");
        longPositionId = traderBuysGas(trader1, 5 ether);
        console2.log("trader2");
        shortPositionId = traderSellsGas(trader2, 5 ether);
        console2.log("done");
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
        (lpPositionId, , , , , ) = foil.createLiquidityPosition(
            IFoilStructs.LiquidityMintParams({
                epochId: epochId,
                amountTokenA: gasTokenAmount,
                amountTokenB: ethTokenAmount,
                collateralAmount: collateralAmount + dust,
                lowerTick: MIN_TICK,
                upperTick: MAX_TICK,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            })
        );
        vm.stopPrank();
    }

    function traderBuysGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        vm.startPrank(trader);
        uint256 positionSize = foil.getLongSizeForCollateral(epochId, amount);
        traderPositionId = foil.createTraderPosition(
            epochId,
            amount + 10 ether,
            int256(positionSize),
            0
        );
        vm.stopPrank();
    }

    function traderSellsGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        vm.startPrank(trader);
        uint256 positionSize = foil.getShortSizeForCollateral(epochId, 5 ether);
        traderPositionId = foil.createTraderPosition(
            epochId,
            10 ether,
            -int256(positionSize),
            0
        );
        vm.stopPrank();
    }

    function testFailSettleInvalidPositionId() public {
        uint256 invalidPositionId = 999; // An ID that doesn't exist

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidPositionId.selector,
                invalidPositionId
            )
        );
        foil.settlePosition(invalidPositionId);
    }

    function testFailSettleByNonOwner() public {
        vm.warp(block.timestamp + 1 days); // Ensure epoch has ended

        address randomUser = address(0x1234);
        vm.startPrank(randomUser);

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.NotAccountOwnerOrAuthorized.selector,
                lpPositionId,
                randomUser
            )
        );
        foil.settlePosition(lpPositionId);

        vm.stopPrank();
    }

    function testFailSettleUnsettledEpoch() public {
        vm.startPrank(lp1);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.EpochNotSettled.selector, epochId)
        );
        foil.settlePosition(lpPositionId);

        vm.stopPrank();
    }

    function testSettleLp() public {
        // Warp to end of epoch
        (, , uint256 endTime, , , , , , , , ) = foil.getLatestEpoch();
        vm.warp(endTime + 1);

        // Set settlement price
        settleEpoch(epochId, settlementPrice, owner);

        // Get initial position details
        Position.Data memory position = foil.getPosition(lpPositionId);
        // Get initial balances
        uint256 initialCollateralBalance = collateralAsset.balanceOf(lp1);

        // Settle LP position
        vm.prank(lp1);
        foil.settlePosition(lpPositionId);

        // Get final balances
        uint256 finalCollateralBalance = collateralAsset.balanceOf(lp1);

        // Assert position is settled
        Position.Data memory updatedPosition = foil.getPosition(lpPositionId);
        bool isSettled = updatedPosition.isSettled;
        assertTrue(isSettled, "Position should be settled");

        assertCollateralBalanceAfterSettlement(position);
    }

    function assertCollateralBalanceAfterSettlement(
        Position.Data memory position
    ) internal {
        (uint256 tokensOwed0, uint256 tokensOwed1) = getOwedTokens(
            position.uniswapPositionId
        );
        console2.log("tokensOwed0", tokensOwed0);
        console2.log("tokensOwed1", tokensOwed1);
    }
}
