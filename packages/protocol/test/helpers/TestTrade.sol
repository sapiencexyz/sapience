// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

import "./TestEpoch.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TestTrade is TestEpoch {
    using Cannon for Vm;
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
    ) internal returns (uint256 positionId) {
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
                collateralAmount: collateralAmount * 2,
                lowerTick: lowerTick,
                upperTick: upperTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp + 30 minutes
            });

        (positionId, , , , , , ) = foil.createLiquidityPosition(params);
    }

    function addTraderPosition(
        IFoil foil,
        uint256 epochId,
        int256 positionSize
    ) internal returns (uint256 positionId) {
        (uint256 requiredCollateral, ) = foil.quoteCreateTraderPosition(
            epochId,
            positionSize
        );
        address foilAddress = vm.getAddress("Foil");
        IMintableToken asset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        if (asset.allowance(msg.sender, foilAddress) < requiredCollateral) {
            asset.approve(foilAddress, requiredCollateral);
        }

        positionId = foil.createTraderPosition(
            epochId,
            positionSize,
            requiredCollateral * 2,
            block.timestamp + 30 minutes
        );
    }

    function modifyTraderPosition(
        IFoil foil,
        uint256 positionId,
        int256 newSize
    ) internal {
        (int256 deltaCollateral, , ) = foil.quoteModifyTraderPosition(
            positionId,
            newSize
        );
        if (deltaCollateral > 0) {
            IMintableToken asset = IMintableToken(
                vm.getAddress("CollateralAsset.Token")
            );
            asset.approve(address(foil), deltaCollateral.toUint() + 2);
        }

        foil.modifyTraderPosition(
            positionId,
            newSize,
            deltaCollateral * 2,
            block.timestamp + 30 minutes
        );
    }

    function closerTraderPosition(IFoil foil, uint256 positionId) internal {
        modifyTraderPosition(foil, positionId, 0);
    }
}
