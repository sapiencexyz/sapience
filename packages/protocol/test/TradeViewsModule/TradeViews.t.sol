// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradeViews is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    IFoil foil;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    uint256 feeRate;
    uint256 onePlusFee;
    uint256 oneMinusFee;

    uint256 minPriceD18;
    uint256 maxPriceD18;
    int24 EPOCH_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 EPOCH_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 23000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 23200; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)

    function setUp() public {
        (foil, ) = createEpoch(
            EPOCH_LOWER_TICK,
            EPOCH_UPPER_TICK,
            INITIAL_PRICE_SQRT
        ); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, , , minPriceD18, maxPriceD18, , , ) = foil
            .getLatestEpoch();

        IUniswapV3Pool uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            COLLATERAL_FOR_ORDERS * 100_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();

        onePlusFee = 1e18 + feeRate;
        oneMinusFee = 1e18 - feeRate;
    }

    function test_getReferencePrice() public view {
        uint256 price = foil.getReferencePrice(epochId);
        assertEq(price, 9999999999999999999);
    }

    function test_quoteCreateLong() public {
        int256 positionSize = 1 ether;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 deltaPrice = price.mulDecimal(onePlusFee) -
            minPriceD18.mulDecimal(oneMinusFee);
        uint256 expectedCollateral = positionSize.toUint().mulDecimal(
            deltaPrice
        );

        uint256 requiredCollateral = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        assertApproxEqRel(
            expectedCollateral,
            requiredCollateral,
            0.05 ether,
            "collateral required open long"
        );
    }

    function test_quoteCreateShort() public {
        int256 positionSize = -1 ether;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 deltaPrice = maxPriceD18.mulDecimal(oneMinusFee) -
            price.mulDecimal(onePlusFee);
        uint256 expectedCollateral = (positionSize * -1).toUint().mulDecimal(
            deltaPrice
        );

        uint256 requiredCollateral = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );

        assertApproxEqRel(
            expectedCollateral,
            requiredCollateral,
            0.05 ether,
            "collateral required open short"
        );
    }
}
