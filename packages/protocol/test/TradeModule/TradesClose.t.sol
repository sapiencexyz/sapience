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
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "forge-std/console2.sol";

contract TradePositionClose is TestTrade {
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
    int24 LP_LOWER_TICK = 23000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 23200; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)
    uint256 INITIAL_PRICE_D18 = 10 ether;
    uint256 INITIAL_PRICE_PLUS_FEE_D18 = 10.1 ether;
    uint256 INITIAL_PRICE_MINUS_FEE_D18 = 9.9 ether;
    uint256 PLUS_FEE_MULTIPLIER_D18 = 1.01 ether;
    uint256 MINUS_FEE_MULTIPLIER_D18 = 0.99 ether;

    function setUp() public {
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        (foil, ) = createEpoch(
            EPOCH_LOWER_TICK,
            EPOCH_UPPER_TICK,
            startingSqrtPriceX96
        );

        lp1 = TestUser.createUser("LP1", 10_000_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

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

    function test_close_long_loss() public {
        // int256 positionSize = 1 ether;
        // vm.startPrank(trader1);
        // // quote and open a long
        // uint256 requiredCollateral = foil.quoteCreateTraderPosition(
        //     epochId,
        //     positionSize
        // );
        // // Send more collateral than required, just checking the position can be created/modified
        // uint256 positionId = foil.createTraderPosition(
        //     epochId,
        //     positionSize,
        //     requiredCollateral * 2,
        //     block.timestamp + 30 minutes
        // );
        // vm.stopPrank();
    }

    function test_close_long_profit() public {}

    function test_close_short_loss() public {}

    function test_close_short_profit() public {}

    // //////////////// //
    // Helper functions //
    // //////////////// //

    function getPnl(int256 initialPositionSize) internal {
        // uint256 trader1InitialBalance = collateralAsset.balanceOf(trader1);
        // int256 pnl;
        // if (initialPositionSize > 0) {
        //     // Long: PNL = (Settlement Price - Initial Price) * Position Size
        //     pnl = initialPositionSize.mulDecimal(
        //         SETTLEMENT_PRICE_D18.toInt() -
        //             INITIAL_PRICE_PLUS_FEE_D18.toInt()
        //     );
        // } else {
        //     // Short: PNL = (Initial Price - Settlement Price) * Position Size * -1 (positionSize is negative for short)
        //     pnl =
        //         -1 *
        //         initialPositionSize.mulDecimal(
        //             INITIAL_PRICE_LESS_FEE_D18.toInt() -
        //                 SETTLEMENT_PRICE_D18.toInt()
        //         );
        // }
        // vm.startPrank(trader1);
        // uint256 requiredCollateral = foil.quoteCreateTraderPosition(
        //     epochId,
        //     initialPositionSize
        // );
        // uint256 positionId = foil.createTraderPosition(
        //     epochId,
        //     initialPositionSize,
        //     requiredCollateral * 2,
        //     block.timestamp + 30 minutes
        // );
        // vm.stopPrank();
        // vm.startPrank(trader1);
        // requiredCollateral = foil.quoteModifyTraderPosition(positionId, 0);
        // foil.modifyTraderPosition(
        //     positionId,
        //     0,
        //     requiredCollateral.toInt(),
        //     block.timestamp + 30 minutes
        // );
        // vm.stopPrank();
        // uint256 trader1FinalBalance = collateralAsset.balanceOf(trader1);
        // assertApproxEqRel(
        //     trader1FinalBalance.toInt() - trader1InitialBalance.toInt(),
        //     pnl,
        //     0.01 ether,
        //     "pnl"
        // );
    }

    /*
    function fillPositionState(
        uint256 positionId,
        StateData memory stateData
    ) public {
        Position.Data memory position = foil.getPosition(positionId);
        stateData.depositedCollateralAmount = position
            .depositedCollateralAmount;
        stateData.vEthAmount = position.vEthAmount;
        stateData.vGasAmount = position.vGasAmount;
        stateData.borrowedVEth = position.borrowedVEth;
        stateData.borrowedVGas = position.borrowedVGas;
        stateData.positionSize = foil.getPositionSize(positionId);
    }

    function fillCollateralStateData(
        address user,
        StateData memory stateData
    ) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.foilCollateral = collateralAsset.balanceOf(address(foil));
    }

    function assertPosition(
        address user,
        uint256 positionId,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(user, currentStateData);
        fillPositionState(positionId, currentStateData);

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.0000001 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            0.0000001 ether,
            string.concat(stage, " foilCollateral")
        );
        assertEq(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            string.concat(stage, " depositedCollateralAmount")
        );
        assertApproxEqRel(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            0.01 ether,
            string.concat(stage, " positionSize")
        );
        assertApproxEqRel(
            currentStateData.vGasAmount,
            expectedStateData.vGasAmount,
            0.001 ether,
            string.concat(stage, " vGasAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVGas,
            expectedStateData.borrowedVGas,
            0.001 ether,
            string.concat(stage, " borrowedVGas")
        );
        assertApproxEqRel(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.15 ether,
            string.concat(stage, " vEthAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.15 ether,
            string.concat(stage, " borrowedVEth")
        );
    }
    */
}
