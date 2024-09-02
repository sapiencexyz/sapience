// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradeViews is TestTrade {
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
    int24 LP_LOWER_TICK = 12200; //3.31
    int24 LP_UPPER_TICK = 12400; //3.52
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 146497135921788803112962621440; // 3.419

    function setUp() public {
        uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

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
            COLLATERAL_FOR_ORDERS * 100_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_getReferencePrice() public {
        uint256 price = foil.getReferencePrice(epochId);
        console.log("price: ", price);
    }

    function test_getLongSizeForCollateral() public {
        uint256 modPositionSize = foil.getLongSizeForCollateral(
            epochId,
            10 ether
        );
        console.log("modPositionSize: ", modPositionSize);
    }

    function test_getShortSizeForCollateral() public {
        uint256 modPositionSize = foil.getShortSizeForCollateral(
            epochId,
            10 ether
        );
        console.log("modPositionSize: ", modPositionSize);
    }

    function test_getLongDeltaForCollateral() public {
        // create an initial long position with 1 ether collateral as trader1
        // uint256 modPositionSize = foil.getLongDeltaForCollateral(
        //     epochId,
        //     10 ether
        // );
        // console.log("modPositionSize: ", modPositionSize);
    }

    function test_getShortDeltaForCollateral() public {
        // create an initial short position with 1 ether collateral as trader1
        // uint256 modPositionSize = foil.getShortDeltaForCollateral(
        //     epochId,
        //     100 ether
        // );
        // console.log("modPositionSize: ", modPositionSize);
    }

    function test_getCollateralForLongSize() public {
        uint256 modPositionSize = foil.getCollateralForLongSize(
            epochId,
            10 ether
        );
        console.log("modPositionSize: ", modPositionSize);
    }

    function test_getCollateralForShortSize() public {
        uint256 modPositionSize = foil.getCollateralForShortSize(
            epochId,
            10 ether
        );
        console.log("modPositionSize: ", modPositionSize);
    }
}
