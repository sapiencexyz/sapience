// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;


import {ISapience} from "../../src/market/interfaces/ISapience.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

import "./TestMarket.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract TestTrade is TestMarket {
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

    function log_positionAccounting(ISapience sapience, uint256 positionId)
        public
        returns (PositionAccountingData memory data)
    {
        Position.Data memory position = sapience.getPosition(positionId);
        uint256 currentPrice = sapience.getReferencePrice(position.marketId);
        data.debtValue = position.borrowedVQuote + position.borrowedVBase.mulDecimal(currentPrice);
        data.tokensValue = position.vQuoteAmount + position.vBaseAmount.mulDecimal(currentPrice);

        data.debtTokensBalance = data.tokensValue.toInt() - data.debtValue.toInt();

        data.collateral = position.depositedCollateralAmount;
        console2.log(" >>> PositionAccountingData");
        console2.log("    >> debtValue                   : ", data.debtValue);
        console2.log("    >> tokensValue                 : ", data.tokensValue);
        console2.log("    >> debtTokensBalance           : ", data.debtTokensBalance);
        console2.log(" >>> PositionData", positionId);
        console2.log("      >> depositedCollateralAmount  : ", position.depositedCollateralAmount);
        console2.log("      >> borrowedVQuote             : ", position.borrowedVQuote);
        console2.log("      >> borrowedVBase              : ", position.borrowedVBase);
        console2.log("      >> vQuoteAmount               : ", position.vQuoteAmount);
        console2.log("      >> vBaseAmount                : ", position.vBaseAmount);
        console2.log("      >> positionSize               : ", sapience.getPositionSize(positionId));
    }

    function addLiquidity(
        ISapience sapience,
        address pool,
        uint256 marketId,
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    ) internal returns (uint256 positionId) {
        pool;
        (uint256 amountBaseToken, uint256 amountQuoteToken,) =
            getTokenAmountsForCollateralAmount(collateralAmount, lowerTick, upperTick);

        ISapienceStructs.LiquidityMintParams memory params = ISapienceStructs.LiquidityMintParams({
            marketId: marketId,
            amountBaseToken: amountBaseToken,
            amountQuoteToken: amountQuoteToken,
            collateralAmount: collateralAmount * 2,
            lowerTick: lowerTick,
            upperTick: upperTick,
            minAmountBaseToken: 0,
            minAmountQuoteToken: 0,
            deadline: block.timestamp + 30 minutes
        });

        (positionId,,,,,,) = sapience.createLiquidityPosition(params);
    }

    function addTraderPosition(ISapience sapience, uint256 marketId, int256 positionSize)
        internal
        returns (uint256 positionId)
    {
        (uint256 requiredCollateral,,) = sapience.quoteCreateTraderPosition(marketId, positionSize);
        address sapienceAddress = vm.getAddress("Sapience");
        IMintableToken asset = IMintableToken(vm.getAddress("CollateralAsset.Token"));

        if (asset.allowance(msg.sender, sapienceAddress) < requiredCollateral) {
            asset.approve(sapienceAddress, requiredCollateral);
        }

        positionId = sapience.createTraderPosition(
            ISapienceStructs.TraderPositionCreateParams({
                marketId: marketId,
                size: positionSize,
                maxCollateral: requiredCollateral * 2,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function modifyTraderPosition(ISapience sapience, uint256 positionId, int256 newSize) internal {
        (int256 deltaCollateral,,,) = sapience.quoteModifyTraderPosition(positionId, newSize);
        if (deltaCollateral > 0) {
            IMintableToken asset = IMintableToken(vm.getAddress("CollateralAsset.Token"));
            asset.approve(address(sapience), deltaCollateral.toUint() + 2);
        }

        sapience.modifyTraderPosition(
            ISapienceStructs.TraderPositionModifyParams({
                positionId: positionId,
                size: newSize,
                deltaCollateralLimit: deltaCollateral * 2,
                deadline: block.timestamp + 30 minutes
            })
        );
    }

    function closerTraderPosition(ISapience sapience, uint256 positionId) internal {
        modifyTraderPosition(sapience, positionId, 0);
    }
}
