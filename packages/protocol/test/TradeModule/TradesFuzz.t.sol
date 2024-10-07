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

contract TradePositionBasicFuzz is TestTrade {
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

    function test_fuzz_create_Long(uint256 position) public {
        position = bound(position, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 positionSize = position.toInt();

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        uint256 requiredCollateral = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral =
            latestStateData.userCollateral -
            requiredCollateral;
        expectedStateData.foilCollateral =
            latestStateData.foilCollateral +
            requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = uint256(positionSize).mulDecimal(
            INITIAL_PRICE_PLUS_FEE_D18
        );
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Create Long"
        );
    }

    function test_fuzz_create_Short(uint256 position) public {
        position = bound(position, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        uint256 positionSizeMod = position;
        int256 positionSize = position.toInt() * -1;

        fillCollateralStateData(trader1, latestStateData);

        vm.startPrank(trader1);
        // quote and open a long
        uint256 requiredCollateral = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        // Send more collateral than required, just checking the position can be created/modified
        uint256 positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        // Set expected state
        expectedStateData.userCollateral =
            latestStateData.userCollateral -
            requiredCollateral;
        expectedStateData.foilCollateral =
            latestStateData.foilCollateral +
            requiredCollateral;
        expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = positionSizeMod.mulDecimal(
            INITIAL_PRICE_MINUS_FEE_D18
        );
        expectedStateData.borrowedVGas = positionSizeMod;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Create Short"
        );
    }

    function test_fuzz_modify_Long2Long(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .00001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 directionPrice = deltaPositionSize > 0
            ? INITIAL_PRICE_PLUS_FEE_D18
            : INITIAL_PRICE_MINUS_FEE_D18;
        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            positionSize
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        int256 deltaCollateral = requiredCollateral -
            latestStateData.depositedCollateralAmount.toInt();

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();
        // expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = (latestStateData.borrowedVEth.toInt() +
            deltaPositionSize.mulDecimal(directionPrice.toInt())).toUint();
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Long"
        );
    }

    function test_fuzz_modify_Short2Short(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .01 ether, 4 ether);
        endPosition = bound(endPosition, .01 ether, 4 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 feeMultiplier = deltaPositionSize > 0
            ? PLUS_FEE_MULTIPLIER_D18
            : MINUS_FEE_MULTIPLIER_D18;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            positionSize
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint256 price = foil.getReferencePrice(epochId).mulDecimal(
            feeMultiplier
        );

        int256 deltaCollateral = requiredCollateral -
            latestStateData.depositedCollateralAmount.toInt();
        int256 deltaEth = (latestStateData.vEthAmount.toInt() -
            deltaPositionSize.mulDecimal(price.toInt()));

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        // expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = deltaEth > 0 ? deltaEth.toUint() : 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = deltaEth < 0
            ? (deltaEth * -1).toUint()
            : 0;
        expectedStateData.borrowedVGas = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Short"
        );
    }

    function test_fuzz_modify_Long2Short(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .00001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();
        int256 positionSize = endPosition.toInt() * -1;

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 feeMultiplier = deltaPositionSize > 0
            ? PLUS_FEE_MULTIPLIER_D18
            : MINUS_FEE_MULTIPLIER_D18;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        console2.log("POSITION CREATED");
        log_positionAccounting(foil, positionId);
        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            positionSize
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();
        console2.log("POSITION UPDATED");
        log_positionAccounting(foil, positionId);
        console2.log(
            "requiredCollateral                  : ",
            requiredCollateral
        );
        console2.log(
            "depositedCollateralAmount           : ",
            latestStateData.depositedCollateralAmount
        );

        uint256 price = foil.getReferencePrice(epochId).mulDecimal(
            feeMultiplier
        );
        int256 deltaCollateral = requiredCollateral -
            latestStateData.depositedCollateralAmount.toInt();
        int256 expectedNetEth = (latestStateData.vEthAmount.toInt() -
            latestStateData.borrowedVEth.toInt()) -
            deltaPositionSize.mulDecimal(price.toInt());

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        // expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = uint256(positionSize * -1).mulDecimal(
            price
        );
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = uint256(positionSize * -1);

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Long2Short"
        );
    }

    function test_fuzz_modify_Short2Long(
        uint256 startPosition,
        uint256 endPosition
    ) public {
        vm.assume(startPosition < endPosition || startPosition > endPosition);

        startPosition = bound(startPosition, .00001 ether, 10 ether);
        endPosition = bound(endPosition, .00001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;
        int256 positionSize = endPosition.toInt();

        int256 deltaPositionSize = positionSize - initialPositionSize;
        uint256 feeMultiplier = deltaPositionSize > 0
            ? PLUS_FEE_MULTIPLIER_D18
            : MINUS_FEE_MULTIPLIER_D18;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            positionSize
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        uint256 price = foil.getReferencePrice(epochId).mulDecimal(
            feeMultiplier
        );
        int256 deltaCollateral = requiredCollateral -
            latestStateData.depositedCollateralAmount.toInt();
        int256 expectedNetEth = (latestStateData.vEthAmount.toInt() -
            latestStateData.borrowedVEth.toInt()) -
            deltaPositionSize.mulDecimal(price.toInt());

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        // expectedStateData.depositedCollateralAmount = requiredCollateral;
        expectedStateData.positionSize = positionSize;
        expectedStateData.vEthAmount = expectedNetEth > 0
            ? expectedNetEth.toUint()
            : 0;
        expectedStateData.vGasAmount = uint256(positionSize);
        expectedStateData.borrowedVEth = expectedNetEth < 0
            ? (expectedNetEth * -1).toUint()
            : 0;
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Short2Long"
        );
    }

    function test_fuzz_close_Long(uint256 startPosition) public {
        startPosition = bound(startPosition, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt();

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            0
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );

        vm.stopPrank();

        int256 deltaCollateral = requiredCollateral -
            latestStateData.depositedCollateralAmount.toInt();

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Close Long"
        );
    }

    function test_fuzz_close_Short(uint256 startPosition) public {
        startPosition = bound(startPosition, .0000001 ether, 10 ether);

        StateData memory latestStateData;
        StateData memory expectedStateData;
        int256 initialPositionSize = startPosition.toInt() * -1;

        uint256 positionId;

        vm.startPrank(trader1);
        positionId = addTraderPosition(foil, epochId, initialPositionSize);
        fillCollateralStateData(trader1, latestStateData);
        fillPositionState(positionId, latestStateData);

        // quote and open a long
        int256 requiredCollateral = foil.quoteModifyTraderPosition(
            positionId,
            0
        );

        // Send more collateral than required, just checking the position can be created/modified
        foil.modifyTraderPosition(
            positionId,
            0,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();

        int256 deltaCollateral = requiredCollateral;

        // Set expected state
        expectedStateData.userCollateral = (latestStateData
            .userCollateral
            .toInt() - deltaCollateral).toUint();
        expectedStateData.foilCollateral = (latestStateData
            .foilCollateral
            .toInt() + deltaCollateral).toUint();

        expectedStateData.depositedCollateralAmount = 0;
        expectedStateData.positionSize = 0;
        expectedStateData.vEthAmount = 0;
        expectedStateData.vGasAmount = 0;
        expectedStateData.borrowedVEth = 0;
        expectedStateData.borrowedVGas = 0;

        // Check position makes sense
        latestStateData = assertPosition(
            trader1,
            positionId,
            expectedStateData,
            "Close short"
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

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.00001 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            0.00001 ether,
            string.concat(stage, " foilCollateral")
        );
        // assertEq(
        //     currentStateData.depositedCollateralAmount,
        //     expectedStateData.depositedCollateralAmount,
        //     string.concat(stage, " depositedCollateralAmount")
        // );
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
        assertApproxEqAbs(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.025 ether,
            string.concat(stage, " vEthAmount")
        );
        assertApproxEqAbs(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.025 ether,
            string.concat(stage, " borrowedVEth")
        );
    }
}
