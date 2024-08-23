// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import {TradeTestHelper} from "./helpers/TradeTestHelper.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";
import "../src/synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../src/synthetix/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../src/contracts/storage/Errors.sol";
import {Position} from "../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradePositionSlippage is TradeTestHelper {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;

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
    int24 LOWERTICK = 12200; //3.31
    int24 UPPERTICK = 12400; //3.52
    uint256 collateralForOrders = 10 ether;
    int256 baseRequestedAmount;
    int256 baseFee;
    int256 baseSlippage;

    function setUp() public {
        uint160 startingSqrtPriceX96 = 146497135921788803112962621440; // 3.419
        baseRequestedAmount = 3.419 ether;
        baseFee = baseRequestedAmount / 100; // 1%
        baseSlippage = baseRequestedAmount / 1000; // 0.1%

        (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrders * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_createTraderPosition_long_RevertIf_SlippageFails() public {
        int256 requested = baseRequestedAmount + baseFee;
        createAndRevert(1 ether, requested, true);
    }

    function test_createTraderPosition_long_SlippageSucceds() public {
        int256 requested = baseRequestedAmount + baseFee + baseSlippage;
        createAndSucceed(1 ether, requested);
    }

    function test_createTraderPosition_long_increase_RevertIf_SlippageFails()
        public
    {
        int256 requested = baseRequestedAmount + baseFee; // it applies just to the delta
        modifyAndRevert(1 ether, 2 ether, requested, true);
    }

    function test_createTraderPosition_long_increase_SlippageSucceds() public {
        int256 requested = baseRequestedAmount + baseFee + baseSlippage; // it applies just to the delta
        modifyAndSucceed(1 ether, 2 ether, requested);
    }

    function test_createTraderPosition_long_reduce_RevertIf_SlippageFails()
        public
    {
        int256 requested = ((baseRequestedAmount - baseFee) / 2) + baseSlippage; // it applies just to the delta
        modifyAndRevert(1 ether, .5 ether, requested, false);
    }

    function test_createTraderPosition_long_reduce_SlippageSucceds() public {
        int256 requested = ((baseRequestedAmount - baseFee) / 2); // it applies just to the delta
        modifyAndSucceed(1 ether, .5 ether, requested);
    }

    // TODO
    function test_createTraderPosition_long_cross_RevertIf_SlippageFails_Only()
        public
    {
        // int256 requested = -1 * (baseRequestedAmount - baseFee);
        // modifyAndRevert(1 ether, -1 ether, requested, false);
    }

    // TODO
    function test_createTraderPosition_long_cross_SlippageSucceds_Only()
        public
    {}

    function test_createTraderPosition_short_RevertIf_SlippageFails() public {
        int256 requested = -1 * (baseRequestedAmount - baseFee);
        createAndRevert(-1 ether, requested, false);
    }

    function test_createTraderPosition_short_SlippageSucceds() public {
        int256 requested = -1 * (baseRequestedAmount - baseFee) + baseSlippage;
        createAndSucceed(-1 ether, requested);
    }

    // TODO
    function test_createTraderPosition_short_increase_RevertIf_SlippageFails_Only()
        public
    {
        // int256 requested = -1 * (baseRequestedAmount - baseFee);
        // modifyAndRevert(-1 ether, -2 ether, requested, false);
    }

    // TODO
    function test_createTraderPosition_short_increase_SlippageSucceds_Only_Skip()
        public
    {
        // int256 requested = -1 * (baseRequestedAmount - baseFee);
        // modifyAndSucceed(-1 ether, -2 ether, requested);
    }

    // TODO
    function test_createTraderPosition_short_reduce_RevertIf_SlippageFails_Only()
        public
    {}

    // TODO
    function test_createTraderPosition_short_reduce_SlippageSucceds_Only()
        public
    {}

    // TODO
    function test_createTraderPosition_short_cross_RevertIf_SlippageFails_Only()
        public
    {}

    // TODO
    function test_createTraderPosition_short_cross_SlippageSucceds_Only()
        public
    {}

    function createAndRevert(
        int256 size,
        int256 limit,
        bool errorIsTooMuchRequested
    ) internal {
        vm.startPrank(trader1);
        uint256 collateral = (size > 0 ? size.toUint() : (-1 * size).toUint()) *
            100; // long enough

        if (errorIsTooMuchRequested) {
            vm.expectRevert("Too much requested");
        } else {
            vm.expectRevert("Too little received");
        }

        foil.createTraderPosition(epochId, collateral, size, limit);
        vm.stopPrank();
    }

    function createAndSucceed(int256 size, int256 limit) internal {
        vm.startPrank(trader1);

        uint256 collateral = (size > 0 ? size.toUint() : (-1 * size).toUint()) *
            100; // long enough

        uint256 positionId = foil.createTraderPosition(
            epochId,
            collateral,
            size,
            limit
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, collateral);
    }

    function modifyAndRevert(
        int256 initialPositionSize,
        int256 newPositionSize,
        int256 newPositionSlippageParam,
        bool errorIsTooMuchRequested
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = createInitialPosition(initialPositionSize);

        uint256 sentCollateral = (
            newPositionSize > 0
                ? newPositionSize.toUint()
                : (-1 * newPositionSize).toUint()
        ) * 100; // long enough

        if (errorIsTooMuchRequested) {
            vm.expectRevert("Too much requested");
        } else {
            vm.expectRevert("Too little received");
        }

        foil.modifyTraderPosition(
            positionId,
            sentCollateral,
            newPositionSize,
            newPositionSlippageParam
        );

        vm.stopPrank();
    }

    function modifyAndSucceed(
        int256 initialPositionSize,
        int256 newPositionSize,
        int256 newPositionSlippageParam
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = createInitialPosition(initialPositionSize);
        Position.Data memory position = foil.getPosition(positionId);
        uint256 preBorrowedEth = position.borrowedVEth;
        int256 preSize = position.currentTokenAmount;
        logPositionAndAccount(foil, positionId);

        uint256 sentCollateral = (
            newPositionSize > 0
                ? newPositionSize.toUint()
                : (-1 * newPositionSize).toUint()
        ) * 100; // long enough

        foil.modifyTraderPosition(
            positionId,
            sentCollateral,
            newPositionSize,
            newPositionSlippageParam
        );
        vm.stopPrank();

        position = foil.getPosition(positionId);

        logPositionAndAccount(foil, positionId);

        if (newPositionSize > 0) {
            if (position.borrowedVEth > preBorrowedEth) {
                assertLt(
                    position.borrowedVEth - preBorrowedEth,
                    newPositionSlippageParam.toUint()
                );
            } else {
                assertGt(
                    preBorrowedEth - position.borrowedVEth,
                    newPositionSlippageParam.toUint()
                );
            }
        } else {
            assertGe(position.currentTokenAmount, newPositionSlippageParam);
        }
    }

    function createInitialPosition(
        int256 size
    ) internal returns (uint256 positionId) {
        uint256 sentCollateral = (
            size > 0 ? size.toUint() : (-1 * size).toUint()
        ) * 100; // long enough

        positionId = foil.createTraderPosition(
            epochId,
            sentCollateral,
            size,
            0 // no slippage protection, we want to test it later
        );
    }
}
