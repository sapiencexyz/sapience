pragma solidity ^0.8.20;

import {FunctionCalls} from "./util/FunctionCalls.sol";
import {FuzzSetup} from "./FuzzSetup.sol";
import "foilInterfaces/IFoilStructs.sol";
import "v3-core/interfaces/IUniswapV3Pool.sol";
import "v3-core/libraries/FullMath.sol";

import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";

import {FuzzEpochLiquidityModule} from "./FuzzEpochLiquidityModule.sol";
import {FuzzEpochConfigurationModule} from "./FuzzEpochConfigurationModule.sol";
import {FuzzEpochTradeModule} from "./FuzzEpochTradeModule.sol";
import {FuzzEpochUMASettlementModule} from "./FuzzEpochUMASettlementModule.sol";
import {FuzzEpochSettlementModule} from "./FuzzEpochSettlementModule.sol";

import {console2} from "forge-std/Test.sol";
contract FoundryPlayground is
    FuzzEpochLiquidityModule,
    FuzzEpochConfigurationModule,
    FuzzEpochTradeModule,
    FuzzEpochUMASettlementModule,
    FuzzEpochSettlementModule
{
    function setUp() public {
        setupFoil();
        vm.warp(1524785992);
    }

    function test_setupFoil() public {
        fuzz_initializeMarket(16000, 29800);
        fuzz_createEpoch(250541448375047931186413801569);
        fuzz_createLiquidityPosition(100 ether, 354651, 2543654); //wiil be round up to nearest valid tick
        fuzz_createTraderPositionShort(1 ether, 1e16);
        fuzz_closeTraderPosition(1 ether);
        fuzz_closeAllLiquidityPositions();
    }

    function test_coverageChecker_fuzz_settleLiquidityPosition() public {
        fuzz_initializeMarket(16000, 29800);
        fuzz_createEpoch(250541448375047931186413801569);
        fuzz_createLiquidityPosition(100 ether, 354651, 2543654); //wiil be round up to nearest valid tick
        fuzz_submitSettlementPrice(5000e18);
        fuzz_mockSettleAssertion(5000e18, false);
        fuzz_settleLiquidityPosition(1);
    }

    function test_repro_TRADE_02() public {
        //FAIL: Long positions have their debt in vETH and own vGAS, vEthAmount = 10
        fuzz_initializeMarket(0, 1);
        fuzz_updateMarket(75904, 0);
        fuzz_createEpoch(11207063676180358045295708943);
        fuzz_createLiquidityPosition(
            6320921310405322450522340039738859078422817654113692489529693569712427037103,
            63480,
            15
        );
        fuzz_createTraderPositionShort(
            2483201322316430803466224825224301199006848041109006801613,
            20
        );
        fuzz_createTraderPositionShort(0, 133774040534815);
        fuzz_modifyTraderPositionLong(
            693097571483957884378750228752164695813911185024676934032,
            1
        );
    }

    function test_fuzz_getAmount0ForLiquidityFoilVsUni(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) public {
        console2.log("sqrtRatioAX96", sqrtRatioAX96);
        console2.log("sqrtRatioBX96", sqrtRatioBX96);
        console2.log("liquidity", liquidity);

        vm.assume(sqrtRatioAX96 > 0);
        vm.assume(sqrtRatioBX96 > 0);

        (
            bool success,
            bytes memory returnData
        ) = _getAmount0ForLiquidity_FoilCall(
                sqrtRatioAX96,
                sqrtRatioBX96,
                liquidity
            );

        require(success);

        uint foil_amount0 = abi.decode(returnData, (uint));

        uint uni_amount0 = getAmount0ForLiquidity(
            sqrtRatioAX96,
            sqrtRatioBX96,
            liquidity
        );
        assertEq(
            foil_amount0,
            uni_amount0,
            "STLESS_01: Uni and Foil amount0 outputs are not equal"
        );

        //Invariant to prove that foil requires always less
        // assertLe(
        //     foil_amount0,
        //     uni_amount0,
        //     "STLESS_01: Uni and Foil amount0 outputs are not equal"
        // );
    }
    function getAmount0ForLiquidity(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) public pure returns (uint256 amount0) {
        unchecked {
            if (sqrtRatioAX96 > sqrtRatioBX96)
                (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);

            return
                FullMath.mulDiv(
                    uint256(liquidity) << 96, //FixedPoint96.RESOLUTION,
                    sqrtRatioBX96 - sqrtRatioAX96,
                    sqrtRatioBX96
                ) / sqrtRatioAX96;
        }
    }
}
