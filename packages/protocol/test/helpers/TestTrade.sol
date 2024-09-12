// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {Position} from "../../src/contracts/storage/Position.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";
import {DecimalMath} from "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

import "./TestEpoch.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TestTrade is TestEpoch {
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;
    using Position for Position.Data;

    uint256 constant dust = 1e8;

    struct PositionAccountingData {
        uint256 debtValue;
        uint256 tokensValue;
        int256 debtTokensBalance;
        uint256 collateral;
    }

    function log_positionAccounting(
        IFoil foil,
        uint256 positionId
    ) public returns (PositionAccountingData memory data) {
        Position.Data memory position = foil.getPosition(positionId);
        uint256 currentPrice = foil.getReferencePrice(position.epochId);
        data.debtValue =
            position.borrowedVEth +
            position.borrowedVGas.mulDecimal(currentPrice);
        data.tokensValue =
            position.vEthAmount +
            position.vGasAmount.mulDecimal(currentPrice);

        data.debtTokensBalance =
            data.tokensValue.toInt() -
            data.debtValue.toInt();

        data.collateral = position.depositedCollateralAmount;
        console2.log(" >>> PositionAccountingData");
        console2.log("    >> debtValue                   : ", data.debtValue);
        console2.log("    >> tokensValue                 : ", data.tokensValue);
        console2.log(
            "    >> debtTokensBalance           : ",
            data.debtTokensBalance
        );
        console2.log(" >>> PositionData", positionId);
        console2.log(
            "      >> depositedCollateralAmount  : ",
            position.depositedCollateralAmount
        );
        console2.log(
            "      >> borrowedVEth               : ",
            position.borrowedVEth
        );
        console2.log(
            "      >> borrowedVGas               : ",
            position.borrowedVGas
        );
        console2.log(
            "      >> vEthAmount                 : ",
            position.vEthAmount
        );
        console2.log(
            "      >> vGasAmount                 : ",
            position.vGasAmount
        );
        console2.log(
            "      >> positionSize               : ",
            foil.getPositionSize(positionId)
        );
    }

    function addLiquidity(
        IFoil foil,
        address pool,
        uint256 epochId,
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        pool;
        (
            uint256 amountTokenA,
            uint256 amountTokenB,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                lowerTick,
                upperTick
            );

        IFoilStructs.LiquidityMintParams memory params = IFoilStructs
            .LiquidityMintParams({
                epochId: epochId,
                amountTokenA: amountTokenA,
                amountTokenB: amountTokenB,
                collateralAmount: collateralAmount + dust,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
    }

    function addTraderPosition(
        IFoil foil,
        uint256 epochId,
        int256 positionSize
    ) internal returns (uint256 positionId) {
        uint256 requiredCollateral = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2
        );
    }
}
