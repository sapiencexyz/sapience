// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../../src/contracts/external/univ3/TickMath.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/contracts/interfaces/IFoilStructs.sol";
import {Position} from "../../src/contracts/storage/Position.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";

import "./TestEpoch.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TradeTestHelper is TestEpoch {
    struct StateData {
        uint256 userCollateral;
        uint256 foilCollateral;
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount; // position size
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
        stateData.currentTokenAmount = position.currentTokenAmount;
        stateData.borrowedVEth = position.borrowedVEth;
        stateData.borrowedVGas = position.borrowedVGas;
    }

    function fillCollateralStateData(
        IFoil foil,
        IMintableToken collateralAsset,
        StateData memory stateData
    ) public {
        stateData.userCollateral = collateralAsset.balanceOf(address(this));
        stateData.foilCollateral = collateralAsset.balanceOf(address(foil));
    }

    function assertPosition(
        IFoil foil,
        uint256 positionId,
        IMintableToken collateralAsset,
        StateData memory expectedStateData,
        string memory stage
    ) public returns (StateData memory currentStateData) {
        fillCollateralStateData(foil, collateralAsset, currentStateData);
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
            currentStateData.currentTokenAmount,
            expectedStateData.currentTokenAmount,
            0.01 ether,
            string.concat(stage, " currentTokenAmount")
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

    function logPositionAndAccount(IFoil foil, uint256 positionId) public {
        Position.Data memory position = foil.getPosition(positionId);
        console2.log(" >>> Position", positionId);
        console2.log("    >>> Ids");
        console2.log("      >> tokenId           : ", position.tokenId);
        console2.log("      >> epochId           : ", position.epochId);
        // console2.log("      >> kind              : ", position.kind);
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
            "      >> currentTokenAmount: ",
            position.currentTokenAmount
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
        (
            uint256 amountTokenA,
            uint256 amountTokenB,

        ) = getTokenAmountsForCollateralAmount(
                collateralAmount,
                lowerTick,
                upperTick
            );

        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: epochId,
                amountTokenA: amountTokenA,
                amountTokenB: amountTokenB,
                collateralAmount: collateralAmount,
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
