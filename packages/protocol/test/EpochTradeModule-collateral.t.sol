// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {TradeTestHelper} from "./helpers/TradeTestHelper.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";
import "../src/synthetix/utils/DecimalMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../src/contracts/storage/Errors.sol";
import {Position} from "../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradePositionCollateral is TradeTestHelper {
    using Cannon for Vm;
    using DecimalMath for uint256;

    IFoil foil;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    address tokenA;
    address tokenB;
    IUniswapV3Pool uniCastedPool;
    uint256 feeRate;
    int24 LOWERTICK = 12200;
    int24 UPPERTICK = 12400;
    uint256 collateralForOrder = 10 ether;

    function setUp() public {
        uint160 startingSqrtPriceX96 = 146497135921788803112962621440; // 3.419
        (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96); // 1.709 to 17.09

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, tokenA, tokenB, , , , ) = foil.getLatestEpoch();

        uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            collateralForOrder * 100_000,
            LOWERTICK,
            UPPERTICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_createTraderPosition_long_RevertIf_NotEnoughCollateral()
        public
    {
        vm.startPrank(trader1);

        uint256 requiredCollateral = 1771551682497315102; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.createTraderPosition(epochId, sentCollateral, 1 ether, 0);
        vm.stopPrank();
    }

    function test_createTraderPosition_long_enoughCollateral() public {
        vm.startPrank(trader1);

        uint256 requiredCollateral = 1771551682497315102; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            1 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_long_increase_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareLongPosition();

        uint256 requiredCollateral = 3543104861549130612; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.createTraderPosition(epochId, sentCollateral, 2 ether, 0);

        vm.stopPrank();
    }

    function test_modifyTraderPosition_long_increase_enoughCollateral() public {
        vm.startPrank(trader1);
        prepareLongPosition();

        uint256 requiredCollateral = 3543104861549130612; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            2 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_long_reduce_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareLongPosition();

        uint256 requiredCollateral = 885776028317949837; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.createTraderPosition(epochId, sentCollateral, 0.5 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_long_reduce_enoughCollateral() public {
        vm.startPrank(trader1);
        prepareLongPosition();

        uint256 requiredCollateral = 885776028317949837; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            0.5 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_long_cross_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareLongPosition();

        // TODO check why this is less than just opening a short 1 ether position. This is wrong
        // It should be 13728525675004143763 or more, not less
        uint256 requiredCollateral = 13728525186079929197; // got from error message

        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );

        foil.createTraderPosition(epochId, sentCollateral, -1 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_long_cross_enoughCollateral() public {
        vm.startPrank(trader1);
        prepareLongPosition();

        uint256 requiredCollateral = 13728525186079929197; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            -1 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_createTraderPosition_short_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);

        uint256 requiredCollateral = 13728525675004143763; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );
        foil.createTraderPosition(epochId, sentCollateral, -1 ether, 0);
        vm.stopPrank();
    }

    function test_createTraderPosition_short_enoughCollateral() public {
        vm.startPrank(trader1);

        uint256 requiredCollateral = 13728525675004143763; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            -1 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_short_increase_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareShortPosition();

        uint256 requiredCollateral = 27457052802112787907; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );

        foil.createTraderPosition(epochId, sentCollateral, -2.0 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_short_increase_enoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareShortPosition();

        uint256 requiredCollateral = 27457052802112787907; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            -2.0 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_short_reduce_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareShortPosition();

        uint256 requiredCollateral = 6864263019015153897; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );

        foil.createTraderPosition(epochId, sentCollateral, -0.5 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_short_reduce_enoughCollateral() public {
        vm.startPrank(trader1);
        prepareShortPosition();

        uint256 requiredCollateral = 6864263019015153897; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            -0.5 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    function test_modifyTraderPosition_short_cross_RevertIf_notEnoughCollateral()
        public
    {
        vm.startPrank(trader1);
        prepareShortPosition();

        // TODO check why this is less than just opening a long 1 ether position. This is wrong
        // It should be 1771551682497315102
        uint256 requiredCollateral = 1771551188634472106; // got from error message
        uint256 sentCollateral = requiredCollateral - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InsufficientCollateral.selector,
                requiredCollateral,
                sentCollateral
            )
        );

        foil.createTraderPosition(epochId, sentCollateral, 1 ether, 0);
        vm.stopPrank();
    }

    function test_modifyTraderPosition_short_cross_enoughCollateral() public {
        vm.startPrank(trader1);
        prepareShortPosition();

        uint256 requiredCollateral = 1771551188634472106; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            1 ether,
            0
        );
        vm.stopPrank();

        Position.Data memory position = foil.getPosition(positionId);
        assertEq(position.depositedCollateralAmount, requiredCollateral);
    }

    // TODO
    function test_modifyTraderPosition_long_edge_reduceWithGains() public {}

    function prepareLongPosition() internal {
        uint256 requiredCollateral = 1771551682497315102; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            1 ether,
            0
        );
    }

    function prepareShortPosition() internal {
        uint256 requiredCollateral = 13728525675004143763; // got from error message

        uint256 positionId = foil.createTraderPosition(
            epochId,
            requiredCollateral,
            -1 ether,
            0
        );
    }
}
