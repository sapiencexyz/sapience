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

    function fillPositionState(
        IFoil foil,
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
        IFoil foil,
        IMintableToken collateralAsset,
        StateData memory stateData
    ) public view {
        stateData.userCollateral = collateralAsset.balanceOf(user);
        stateData.foilCollateral = collateralAsset.balanceOf(address(foil));
    }

    function assertPosition(
        address user,
        IFoil foil,
        uint256 positionId,
        IMintableToken collateralAsset,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(user, foil, collateralAsset, currentStateData);
        fillPositionState(foil, positionId, currentStateData);

        assertApproxEqRel(
            currentStateData.userCollateral,
            expectedStateData.userCollateral,
            0.0000001 ether,
            string.concat(stage, " userCollateral")
        );
        assertApproxEqRel(
            currentStateData.foilCollateral,
            expectedStateData.foilCollateral,
            0.0000001 ether,
            string.concat(stage, " foilCollateral")
        );
        assertEq(
            currentStateData.depositedCollateralAmount,
            expectedStateData.depositedCollateralAmount,
            string.concat(stage, " depositedCollateralAmount")
        );
        assertApproxEqRel(
            currentStateData.positionSize,
            expectedStateData.positionSize,
            0.01 ether,
            string.concat(stage, " positionSize")
        );
        assertApproxEqRel(
            currentStateData.vEthAmount,
            expectedStateData.vEthAmount,
            0.01 ether,
            string.concat(stage, " vEthAmount")
        );
        assertApproxEqRel(
            currentStateData.vGasAmount,
            expectedStateData.vGasAmount,
            0.01 ether,
            string.concat(stage, " vGasAmount")
        );
        assertApproxEqRel(
            currentStateData.borrowedVEth,
            expectedStateData.borrowedVEth,
            0.01 ether,
            string.concat(stage, " borrowedVEth")
        );
        assertApproxEqRel(
            currentStateData.borrowedVGas,
            expectedStateData.borrowedVGas,
            0.01 ether,
            string.concat(stage, " borrowedVGas")
        );
    }

    struct PositionAccountingData {
        uint256 debtValue;
        uint256 tokensValue;
        int256 debtTokensBalance;
        uint256 collateral;
        uint256 withdrawableCollateral;
    }

    function positionAccounting(
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

        data.withdrawableCollateral = data.collateral - data.debtValue;
        console2.log(" >>> PositionAccountingData");
        console2.log("    >> debtValue           : ", data.debtValue);
        console2.log("    >> tokensValue         : ", data.tokensValue);
        console2.log("    >> debtTokensBalance   : ", data.debtTokensBalance);
        console2.log("    >> collateral          : ", data.collateral);
        console2.log(
            "    >> withdrawableCollateral: ",
            data.withdrawableCollateral
        );
        console2.log(" >>> PositionData", positionId);
        console2.log(
            "      >> depositedCollateralAmount  : ",
            position.depositedCollateralAmount
        );
        console2.log("      >> borrowedVEth      : ", position.borrowedVEth);
        console2.log("      >> borrowedVGas       : ", position.borrowedVGas);
        console2.log("      >> vEthAmount        : ", position.vEthAmount);
        console2.log("      >> vGasAmount        : ", position.vGasAmount);
        console2.log(
            "      >> positionSize: ",
            foil.getPositionSize(positionId)
        );
    }

    function logPositionAndAccount(IFoil foil, uint256 positionId) public {
        Position.Data memory position = foil.getPosition(positionId);
        console2.log(" >>> Position", positionId);
        console2.log("    >>> Ids");
        console2.log("      >> tokenId           : ", position.id);
        console2.log("      >> epochId           : ", position.epochId);
        console2.log("    >>> Accounting data (debt and deposited collateral)");
        console2.log(
            "      >> depositedCollateralAmount  : ",
            position.depositedCollateralAmount
        );
        console2.log("      >> borrowedVEth      : ", position.borrowedVEth);
        console2.log("      >> borrowedVGas       : ", position.borrowedVGas);
        console2.log("    >>> Position data (owned tokens and position size)");
        console2.log("      >> vEthAmount        : ", position.vEthAmount);
        console2.log("      >> vGasAmount        : ", position.vGasAmount);
        console2.log(
            "      >> positionSize: ",
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

    function addPreTrade(
        IFoil foil,
        uint256 epochId,
        uint256 collateral
    ) internal {
        int256 positionSize = int256(collateral / 100);

        foil.createTraderPosition(epochId, collateral, positionSize, 0);
    }
}
