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

contract TradePositionDumb is TestTrade {
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

        // Remove allowance of collateralAsset from trader1 to foil
        vm.startPrank(trader1);
        collateralAsset.approve(address(foil), 0);
        vm.stopPrank();

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

    function test_create_Long() public {
        int256 positionSize = 1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        collateralAsset.approve(address(foil), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected data
        StateData memory expectedStateData;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 1 ether;
        expectedStateData.borrowedVEth = INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.borrowedVGas = 0;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.userCollateral =
            initialStateData.userCollateral -
            requiredCollateral;

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Create Long");
    }

    function test_create_Short() public {
        int256 positionSize = -1 ether;
        StateData memory initialStateData;
        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        // quote and open a long
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        collateralAsset.approve(address(foil), requiredCollateral + 2);
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral + 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected data
        StateData memory expectedStateData;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 1 ether;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.userCollateral =
            initialStateData.userCollateral -
            requiredCollateral;

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Create Short");
    }

    function test_close_Long() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            0
        );

        if (requiredCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredCollateral.toUint() + 2
            );
        }
        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral - 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 pnl = (INITIAL_PRICE_MINUS_FEE_D18.toInt() -
            INITIAL_PRICE_PLUS_FEE_D18.toInt()).mulDecimal(initialPositionSize);

        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;
        expectedStateData.depositedCollateralAmount = 0;

        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() + pnl).toUint();

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Close Long");
    }

    function test_close_Short() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            0
        );
        if (requiredCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral - 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 pnl = (INITIAL_PRICE_MINUS_FEE_D18.toInt() -
            INITIAL_PRICE_PLUS_FEE_D18.toInt()).mulDecimal(
                initialPositionSize * -1
            );

        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;
        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() + pnl).toUint();

        // Check position makes sense
        assertPosition(trader1, positionId, expectedStateData, "Close Short");
    }

    function test_modify_Long2Long_Increase() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = 2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);
        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        fillCollateralStateData(trader1, initialStateData);
        fillPositionState(positionId, initialStateData);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint()
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = finalPositionSize.toUint();
        expectedStateData.borrowedVEth = finalPositionSize.toUint().mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );
        expectedStateData.borrowedVGas = 0;

        expectedStateData.depositedCollateralAmount =
            (initialStateData.depositedCollateralAmount.toInt() +
                requiredDeltaCollateral).toUint() +
            closePnL.toUint();
        expectedStateData.userCollateral = (initialStateData
            .userCollateral
            .toInt() - requiredDeltaCollateral).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long Increase"
        );
    }

    function test_modify_Long2Long_Reduce() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = .5 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() - 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral - 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint partialVEth = initialPositionSize.toUint().mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = finalPositionSize.toUint();
        expectedStateData.borrowedVEth =
            partialVEth -
            INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(.5 ether) -
            (closePnL * -1).toUint();
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long Reduce"
        );
    }

    function test_modify_Short2Short_Increase() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = -2 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount = (finalPositionSize * -1)
            .toUint()
            .mulDecimal(INITIAL_PRICE_MINUS_FEE_D18);
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short Increase"
        );
    }

    function test_modify_Short2Short_Reduce() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = -.5 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, int256 closePnL, ) = foil
            .quoteModifyTraderPosition(positionId, finalPositionSize);

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }
        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral - 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint partialVEth = (initialPositionSize * -1).toUint().mulDecimal(
            INITIAL_PRICE_MINUS_FEE_D18
        );

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount =
            partialVEth -
            INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(.5 ether) +
            (closePnL * -1).toUint();
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short Reduce"
        );
    }

    function test_modify_Long2Short() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = 1 ether;
        int256 finalPositionSize = -1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );

        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral + 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount = INITIAL_PRICE_MINUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = (finalPositionSize * -1).toUint();

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Short Reduce"
        );
    }

    function test_modify_Short2Long() public {
        StateData memory initialStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = -1 ether;
        int256 finalPositionSize = 1 ether;

        uint256 positionId;

        fillCollateralStateData(trader1, initialStateData);

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);

        // quote and close a long
        (int256 requiredDeltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            finalPositionSize
        );
        if (requiredDeltaCollateral > 0) {
            collateralAsset.approve(
                address(foil),
                requiredDeltaCollateral.toUint() + 2
            );
        }

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            finalPositionSize,
            requiredDeltaCollateral - 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        expectedStateData.positionSize = finalPositionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = (finalPositionSize).toUint();
        expectedStateData.borrowedVEth = INITIAL_PRICE_PLUS_FEE_D18.mulDecimal(
            1 ether
        );
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Long Reduce"
        );
    }

    // //////////////// //
    // Helper functions //
    // //////////////// //

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

        if (expectedStateData.userCollateral != 0) {
            fillCollateralStateData(user, currentStateData);
            assertApproxEqRel(
                currentStateData.userCollateral,
                expectedStateData.userCollateral,
                0.0000001 ether,
                string.concat(stage, " userCollateral")
            );
            assertEq(
                currentStateData.depositedCollateralAmount,
                expectedStateData.depositedCollateralAmount,
                string.concat(stage, " depositedCollateralAmount")
            );
        }
        assertApproxEqRel(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            0.00001 ether,
            string.concat(stage, " positionSize")
        );
        assertApproxEqRel(
            currentStateData.vGasAmount,
            expectedStateData.vGasAmount,
            0.00001 ether,
            string.concat(stage, " vGasAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVGas,
            expectedStateData.borrowedVGas,
            0.00001 ether,
            string.concat(stage, " borrowedVGas")
        );
        assertApproxEqRel(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.0015 ether,
            string.concat(stage, " vEthAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.0015 ether,
            string.concat(stage, " borrowedVEth")
        );
    }
}
