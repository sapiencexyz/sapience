// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "../../src/synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../../src/synthetix/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradePositionCollateral is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;

    IFoil foil;

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

    function setUp() public {
        uint160 startingSqrtPriceX96 = 146497135921788803112962621440; // 3.419
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

    function test_createTraderPosition_long_RevertIf_NotEnoughCollateral()
        public
    {
        // -> 1 ether here means I want 1e18 vGAS
        createAndRevert(1771551682497315102, 1 ether);
    }

    function test_createTraderPosition_long_enoughCollateral() public {
        createAndSucceed(1771551682497315102, 1 ether);
    }

    function test_modifyTraderPosition_long_increase_RevertIf_notEnoughCollateral()
        public
    {
        modifyAndRevert(3543103863846094311, true, 2 ether);
    }

    function test_modifyTraderPosition_long_increase_enoughCollateral() public {
        modifyAndSucceed(3543103863846094311, true, 2 ether);
    }

    function test_modifyTraderPosition_long_reduce_RevertIf_notEnoughCollateral()
        public
    {
        modifyAndRevert(920138458771431266, true, 0.5 ether);
    }

    function test_modifyTraderPosition_long_reduce_enoughCollateral() public {
        modifyAndSucceed(920138458771431266, true, 0.5 ether);
    }

    function test_modifyTraderPosition_long_cross_RevertIf_notEnoughCollateral()
        public
    {
        modifyAndRevert(13728525670114902142, true, -1 ether);
    }

    function test_modifyTraderPosition_long_cross_enoughCollateral() public {
        modifyAndSucceed(13728525670114902142, true, -1 ether);
    }

    function test_createTraderPosition_short_RevertIf_notEnoughCollateral()
        public
    {
        createAndRevert(13728525675004143763, -1 ether);
    }

    function test_createTraderPosition_short_enoughCollateral() public {
        createAndSucceed(13728525675004143763, -1 ether);
    }

    function test_modifyTraderPosition_short_increase_RevertIf_notEnoughCollateral()
        public
    {
        modifyAndRevert(27457051834043155596, false, -2 ether);
    }

    function test_modifyTraderPosition_short_increase_enoughCollateral()
        public
    {
        modifyAndSucceed(27457051834043155596, false, -2 ether);
    }

    function test_modifyTraderPosition_short_reduce_RevertIf_notEnoughCollatera()
        public
    {
        modifyAndRevert(6898625450703496607, false, -0.5 ether);
    }

    function test_modifyTraderPosition_short_reduce_enoughCollateral() public {
        modifyAndSucceed(6898625450703496607, false, -0.5 ether);
    }

    function test_modifyTraderPosition_short_cross_RevertIf_notEnoughCollateral()
        public
    {
        modifyAndRevert(1771551687485829208, false, 1 ether);
    }

    function test_modifyTraderPosition_short_cross_enoughCollateral() public {
        modifyAndSucceed(1771551687485829208, false, 1 ether);
    }

    // TODO
    function test_modifyTraderPosition_long_edge_reduceWithGains() public {}

    function createAndRevert(uint requiredCollateral, int size) internal {
        vm.startPrank(trader1);

        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.createTraderPosition(epochId, sentCollateral, size, 0);
        vm.stopPrank();
    }

    function createAndSucceed(uint requiredCollateral, int size) internal {
        vm.startPrank(trader1);

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            size,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function modifyAndRevert(
        uint requiredCollateral,
        bool initialPositionIsLong,
        int256 newPositionSize
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = createInitialPosition(initialPositionIsLong);

        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.modifyTraderPosition(
            positionId,
            sentCollateral,
            newPositionSize,
            0
        );

        vm.stopPrank();
    }

    function modifyAndSucceed(
        uint requiredCollateral,
        bool initialPositionIsLong,
        int256 newPositionSize
    ) internal {
        vm.startPrank(trader1);
        uint256 positionId = createInitialPosition(initialPositionIsLong);
        Position.Data memory position = foil.getPosition(positionId);
        uint256 preBorrowedEth = position.borrowedVEth;
        int256 preSize = position.currentTokenAmount;

        foil.modifyTraderPosition(
            positionId,
            requiredCollateral,
            newPositionSize,
            0
        );
        vm.stopPrank();

        position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function createInitialPosition(
        bool initialPositionIsLong
    ) internal returns (uint256 positionId) {
        uint256 requiredCollateral = initialPositionIsLong
            ? 1771551682497315102
            : 13728525675004143763;
        int256 size = initialPositionIsLong
            ? int256(1 ether)
            : int256(-1 ether);

        positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            size,
            0
            // initialPositionIsLong ? int256(1) : int256(-1) // almost no slippage protection, we want to test it later
        );
    }
}
